-- LOCAL DISPOSABLE DATABASE ONLY. Synthetic fixtures, rolled back in full.
begin;
insert into tasks(key,title,category,points,sort)
select 'm'||n,'Lesson '||n,'module',20,n from generate_series(1,7) n on conflict(key) do nothing;
insert into settings values('admin_hash',encode(extensions.digest('local-only-test','sha256'),'hex'))
on conflict(key) do update set value=excluded.value;
insert into entrants(email,full_name,skool_name,country,rules_accepted,is_test,disqualified,preferred_grain) values
 ('zero@example.invalid','Zero Lessons','Synthetic','United States',true,false,false,'Spelt'),
 ('pending@example.invalid','Pending Only','Synthetic','United States',true,false,false,'Spelt'),
 ('bonus@example.invalid','Bonus Only','Synthetic','United States',true,false,false,'Rye'),
 ('full@example.invalid','Grain Winner','Synthetic','United States',true,false,false,'Spelt'),
 ('eligible@example.invalid','Eligible For Grain','Synthetic','United States',true,false,false,'Rye'),
 ('test@example.invalid','Flagged Test','Synthetic','United States',true,true,false,'Spelt'),
 ('removed@example.invalid','Removed Baker','Synthetic','United States',true,false,true,'Spelt');
insert into claims(entrant_id,task_key,status)
select id,'m1','pending' from entrants where email='pending@example.invalid';
insert into claims(entrant_id,task_key,status)
select id,'bake_grain','verified' from entrants where email='bonus@example.invalid';
insert into claims(entrant_id,task_key,status,proof)
select id,'m'||n,'verified','YouTube: Synthetic · Score: 90%' from entrants cross join generate_series(1,7) n
where email in ('full@example.invalid','eligible@example.invalid','test@example.invalid','removed@example.invalid');
insert into draws(prize,entrant_id,entries,pool_size,kind)
select '5 lb bag',id,140,1,'weekly' from entrants where email='full@example.invalid';
insert into draws(prize,entrant_id,entries,pool_size,kind)
select 'Grand prize: 25 lb bag',id,140,1,'grand' from entrants where email='full@example.invalid';
create temp table grain_before as
select kind, entrant_id,weight from (values('weekly'),('final_small'),('grand')) k(kind)
cross join lateral _draw_pool(kind);

do $$
declare r json; d uuid; token uuid;
begin
  if (select count(*) from _draw_pool('mixer'))<>5 then raise exception 'Mixer pool excludes registered zero-lesson bakers or includes test/removed'; end if;
  if (select count(*) from grain_before)<>3 then raise exception 'Expected one eligible baker in each grain pool'; end if;
  if (select weight from _draw_pool('mixer') p join entrants e on e.id=p.entrant_id where email='zero@example.invalid')<>1 then raise exception 'Missing automatic base entry'; end if;
  if (select weight from _draw_pool('mixer') p join entrants e on e.id=p.entrant_id where email='pending@example.invalid')<>1 then raise exception 'Pending points counted'; end if;
  if (select weight from _draw_pool('mixer') p join entrants e on e.id=p.entrant_id where email='bonus@example.invalid')<>16 then raise exception 'Bonus-only score not added to base'; end if;
  if (select weight from _draw_pool('mixer') p join entrants e on e.id=p.entrant_id where email='full@example.invalid')<>141 then raise exception 'Grain winner lost mixer eligibility or weight'; end if;
  if admin_draw('wrong','Bosch Universal Plus stand mixer','mixer',null)->>'error'<>'denied' then raise exception 'Ungated mixer draw'; end if;
  if admin_draw('local-only-test','5 lb bag','mixer',null)->>'error'<>'prize' then raise exception 'Grain prize admitted to mixer draw'; end if;
  if admin_draw('local-only-test','Bosch Universal Plus stand mixer','grand',null)->>'error'<>'prize' then raise exception 'Mixer admitted to grain pool'; end if;
  if has_function_privilege('anon','public._draw_pool(text)','execute') then raise exception 'Pool helper exposed'; end if;

  r:=admin_draw('local-only-test','Bosch Universal Plus stand mixer','mixer','Mixer · Dec 1');
  if r->>'error' is not null then raise exception 'Mixer draw failed: %',r; end if;
  select id into d from draws where kind='mixer';
  select claim_token into token from winner_fulfillment where draw_id=d;
  if token is null or (select grain from winner_fulfillment where draw_id=d)<>'' then raise exception 'Mixer fulfillment must not request grain'; end if;
  if exists(select 1 from _draw_pool('mixer') where entrant_id=(select entrant_id from draws where id=d)) then raise exception 'Same baker can win mixer twice'; end if;
  if admin_draw('local-only-test','Bosch Universal Plus stand mixer','mixer',null)->>'error'<>'prize_limit' then raise exception 'Second active mixer winner allowed'; end if;
  if exists((select * from grain_before except select kind,entrant_id,weight from (values('weekly'),('final_small'),('grand')) k(kind) cross join lateral _draw_pool(kind))
    union all (select kind,entrant_id,weight from (values('weekly'),('final_small'),('grand')) k(kind) cross join lateral _draw_pool(kind) except select * from grain_before)) then raise exception 'Mixer changed grain pools'; end if;
  if (winner_claim(token)->>'kind')<>'mixer' or winner_claim(token)::text like '%example.invalid%' then raise exception 'Mixer claim view wrong'; end if;
  r:=winner_claim_submit(token,'','Synthetic Winner','1 Main St','','Columbus','OH','43215','United States','');
  if (r->>'ok')::boolean is not true then raise exception 'Mixer required a grain: %',r; end if;
  if (select status from winner_fulfillment where draw_id=d)<>'address_received' then raise exception 'Mixer address not saved'; end if;
  perform admin_winner_mark('local-only-test',d,'sent_to_partner');
  if winner_claim_submit(token,'','Synthetic Winner','2 Main St','','Columbus','OH','43215','United States','')->>'error'<>'locked' then raise exception 'Mixer shipment lock failed'; end if;
  -- A closed, unclaimed prize can be redrawn for another baker while retaining the audit trail.
  update winner_fulfillment set status='notified',address_received_at=null,address1='' where draw_id=d;
  perform admin_winner_mark('local-only-test',d,'forfeited');
  if winner_claim_submit(token,'','Synthetic Winner','2 Main St','','Columbus','OH','43215','United States','')->>'error'<>'closed' then raise exception 'Forfeited claim accepted'; end if;
  r:=admin_draw('local-only-test','Bosch Universal Plus stand mixer','mixer','Mixer redraw');
  if r->>'error' is not null then raise exception 'Forfeited mixer redraw blocked'; end if;
  if (select count(distinct entrant_id) from draws where kind='mixer')<>2 then raise exception 'Redraw picked previous winner'; end if;
  if admin_draw('local-only-test','Bosch Universal Plus stand mixer','mixer',null)->>'error'<>'prize_limit' then raise exception 'Redraw cap failed'; end if;
end $$;
rollback;
select 'PASS: mixer base plus verified weights, zero-lesson eligibility, grain independence, draw cap, claim/lock, and forfeiture redraw' as result;
