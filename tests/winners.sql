-- LOCAL DISPOSABLE DATABASE ONLY. Synthetic entrants and draws; everything rolls back.
begin;
insert into tasks(key,title,category,points,sort) select 'm'||n,'Lesson '||n,'module',20,n from generate_series(1,7) n on conflict(key) do nothing;
insert into settings values('admin_hash',encode(extensions.digest('local-only-test','sha256'),'hex')) on conflict(key) do update set value=excluded.value;
insert into entrants(email,full_name,skool_name,country,region,rules_accepted,preferred_grain) values
  ('win@example.invalid','Winnie Baker','Crust & Crumb Academy','United States','Ohio',true,'Surprise me');
insert into claims(entrant_id,task_key,proof,status)
select e.id,'m1','YouTube: Synthetic · Score: 80%','verified' from entrants e where e.email='win@example.invalid';
do $$
declare r json; d uuid; tok uuid; f winner_fulfillment;
begin
  r := admin_draw('local-only-test','5 lb bag','weekly',null);
  if r->>'name' <> 'Winnie Baker' then raise exception 'Synthetic draw failed: %', r; end if;
  select id into d from draws order by drawn_at desc limit 1;

  -- Trigger created the fulfillment row seeded with the registration grain.
  select * into f from winner_fulfillment where draw_id = d;
  if f.draw_id is null or f.status <> 'drawn' or f.grain <> 'Surprise me' then raise exception 'Trigger did not seed fulfillment'; end if;
  tok := f.claim_token;

  -- Admin gate.
  if admin_winners('wrong')->>'error' <> 'denied' then raise exception 'Ungated admin_winners'; end if;
  if admin_winner_mark('wrong',d,'notified')->>'error' <> 'denied' then raise exception 'Ungated mark'; end if;
  if admin_winner_edit('wrong',d,'{"notes":"unauthorized"}'::json)->>'error' <> 'denied' then raise exception 'Ungated edit'; end if;
  if admin_set_draw_label('wrong',d,'x')->>'error' <> 'denied' then raise exception 'Ungated label'; end if;
  if (select count(*) from json_array_elements(admin_winners('local-only-test')) w where (w->>'draw_id')::uuid = d and w->>'claim_token' = tok::text) <> 1 then
    raise exception 'admin_winners missing draw or claim token'; end if;

  -- Label fix shows on the public list.
  perform admin_set_draw_label('local-only-test',d,'Week 1 · Oct 16');
  if not exists (select 1 from json_array_elements(winners()) w where w->>'label' = 'Week 1 · Oct 16' and w->>'name' = 'Winnie B.') then
    raise exception 'Label did not reach public winners'; end if;

  -- Notify starts the 7 day clock.
  perform admin_winner_mark('local-only-test',d,'notified');
  select * into f from winner_fulfillment where draw_id = d;
  if f.status <> 'notified' or f.notified_at is null or f.claim_expires_at < now() + interval '6 days' then raise exception 'Notify did not set clock'; end if;

  -- Public claim view exposes no email, shows first name and prize.
  r := winner_claim(tok);
  if r->>'first_name' <> 'Winnie' or r->>'prize' <> '5 lb bag' or (r->>'submitted')::boolean or r::text like '%example.invalid%' then
    raise exception 'Claim view wrong: %', r; end if;
  if winner_claim(gen_random_uuid())->>'error' <> 'notfound' then raise exception 'Random token resolved'; end if;

  -- Validation.
  if winner_claim_submit(tok,'Spelt','Winnie Baker','','','Columbus','OH','43215','United States','')->>'error' <> 'address' then raise exception 'Empty address accepted'; end if;
  if winner_claim_submit(tok,'','Winnie Baker','1 Main St','','Columbus','OH','43215','United States','')->>'error' <> 'grain' then raise exception 'Empty grain accepted'; end if;

  -- Good submission moves the status and records the address.
  r := winner_claim_submit(tok,'Spelt','Winnie Baker','1 Main St','Apt 2','Columbus','OH','43215','United States','614-555-0100');
  if (r->>'ok')::boolean is not true then raise exception 'Good submit failed: %', r; end if;
  select * into f from winner_fulfillment where draw_id = d;
  if f.status <> 'address_received' or f.grain <> 'Spelt' or f.address1 <> '1 Main St' or f.phone <> '614-555-0100' or f.address_received_at is null then
    raise exception 'Submit did not save'; end if;
  if (winner_claim(tok)->>'submitted')::boolean is not true then raise exception 'Claim view not marked submitted'; end if;

  -- Winner can correct until it goes to the partner; then it locks.
  perform winner_claim_submit(tok,'Spelt','Winnie Baker','2 Main St','','Columbus','OH','43215','United States','');
  if (select address1 from winner_fulfillment where draw_id = d) <> '2 Main St' then raise exception 'Correction blocked too early'; end if;
  perform admin_winner_mark('local-only-test',d,'sent_to_partner');
  if winner_claim_submit(tok,'Spelt','Winnie Baker','3 Main St','','Columbus','OH','43215','United States','')->>'error' <> 'locked' then raise exception 'Not locked after partner send'; end if;
  if (winner_claim(tok)->>'locked')::boolean is not true then raise exception 'Claim view not locked'; end if;

  -- Admin edits and the rest of the pipeline.
  perform admin_winner_edit('local-only-test',d,'{"tracking":"1Z999","notes":"Called to confirm"}'::json);
  perform admin_winner_mark('local-only-test',d,'shipped');
  perform admin_winner_mark('local-only-test',d,'announced');
  select * into f from winner_fulfillment where draw_id = d;
  if f.status <> 'shipped' or f.tracking <> '1Z999' or f.notes <> 'Called to confirm' or f.announced_at is null or f.sent_to_partner_at is null then
    raise exception 'Pipeline end state wrong'; end if;
  if f.address1 <> '2 Main St' then raise exception 'Edit clobbered address'; end if;

  -- Anonymous role cannot read the table directly.
  if has_table_privilege('anon','public.winner_fulfillment','select') then raise exception 'anon can read fulfillment'; end if;
  if has_table_privilege('authenticated','public.winner_fulfillment','select,insert,update,delete')
     or has_table_privilege('anon','public.winner_fulfillment','insert,update,delete') then
    raise exception 'Untrusted role has direct fulfillment privileges'; end if;
  if exists (select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where p.pronamespace='public'::regnamespace and p.proname in
      ('_fulfillment_for_draw','admin_winners','admin_winner_mark','admin_winner_edit','admin_set_draw_label','winner_claim','winner_claim_submit')
      and a.grantee=0 and a.privilege_type='EXECUTE') then
    raise exception 'New function executable by PUBLIC'; end if;

  -- Draw pools are untouched by the new table: the winner is still out of the small pool, in the grand pool once qualified.
  if exists (select 1 from _draw_pool('weekly') where entrant_id = (select entrant_id from draws where id = d)) then raise exception 'Pool changed'; end if;
  raise notice 'PASS: winner fulfillment trigger, admin gate, label, claim view/submit, lock, edit, pipeline, privileges';
end $$;
rollback;
