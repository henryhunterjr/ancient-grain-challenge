-- LOCAL DISPOSABLE DATABASE ONLY. All entries/claims/draws below are synthetic.
-- The entire fixture and draw history are rolled back; never run this in production.
begin;
insert into tasks(key,title,category,points) select 'm'||n,'Lesson '||n,'module',20 from generate_series(1,7) n on conflict(key) do nothing;
insert into settings values('admin_hash',encode(extensions.digest('local-only-test','sha256'),'hex'));
insert into entrants(email,full_name,skool_name,country,rules_accepted,is_test,disqualified) values
  ('one@example.invalid','Test Looking Baker','Free public','United States',true,false,false),
  ('six@example.invalid','Six Lessons','Free public','United States',true,false,false),
  ('full@example.invalid','Full Seven','Free public','United States',true,false,false),
  ('test@example.invalid','Explicit Test','Free public','United States',true,true,false),
  ('removed@example.invalid','Removed Baker','Free public','United States',true,false,true);
insert into claims(entrant_id,task_key,proof,status)
select e.id,'m'||n,'YouTube: Synthetic · Score: 80%','verified' from entrants e
cross join generate_series(1,7) n
where e.email in ('full@example.invalid','test@example.invalid','removed@example.invalid')
  or (e.email='one@example.invalid' and n=1) or (e.email='six@example.invalid' and n<=6);
do $$
declare full_id uuid; result json;
begin
  select id into full_id from entrants where email='full@example.invalid';
  if (select count(*) from _draw_pool('weekly'))<>3 then raise exception 'Weekly pool must include 1,6,7 lessons only'; end if;
  if (select count(*) from _draw_pool('final_small'))<>1 or (select entrant_id from _draw_pool('final_small'))<>full_id then raise exception 'Final small pool admitted partial/test/removed entrant'; end if;
  if (select count(*) from _draw_pool('grand'))<>1 then raise exception 'Grand pool wrong'; end if;
  if (select count(*) from _draw_pool('unknown'))<>0 then raise exception 'Unknown kind pool'; end if;
  if exists(select 1 from json_array_elements(leaderboard()) e where e->>'name'='Explicit T.') then raise exception 'Test leaked onto public leaderboard'; end if;
  if (stats()->>'entrants')::integer<>3 then raise exception 'Public counts include test/removed'; end if;
  if admin_draw('wrong','5 lb bag','final_small',null)->>'error'<>'denied' then raise exception 'Ungated draw'; end if;
  if to_regprocedure('public.admin_draw(text,text)') is not null then raise exception 'Old overload remains'; end if;
  if admin_draw('local-only-test','5 lb bag')->>'error'<>'prize' then raise exception 'Defaulted grand call drew a small prize'; end if;
  if admin_draw('local-only-test','5 lb bag','grand',null)->>'error'<>'prize' then raise exception 'Small prize through grand pool'; end if;
  if admin_draw('local-only-test','Grand prize: 25 lb bag','final_small',null)->>'error'<>'prize' then raise exception 'Grand prize through small pool'; end if;
  -- Deterministic synthetic draws with a singleton pool, never a live API call.
  update entrants set disqualified=true where email in ('one@example.invalid','six@example.invalid');
  result:=admin_draw('local-only-test','5 lb bag','weekly','Synthetic Friday');
  if result->>'name'<>'Full Seven' then raise exception 'Singleton weekly draw failed'; end if;
  if exists(select 1 from _draw_pool('weekly') where entrant_id=full_id)
    or exists(select 1 from _draw_pool('final_small') where entrant_id=full_id) then raise exception 'Weekly winner can win another small bag'; end if;
  if not exists(select 1 from _draw_pool('grand') where entrant_id=full_id) then raise exception 'Small winner lost grand eligibility'; end if;
  if admin_draw('local-only-test','5 lb bag','final_small',null)->>'error'<>'empty' then raise exception 'Final empty pool failed'; end if;
end $$;
insert into entrants(email,full_name,skool_name,country,rules_accepted)
select 'final'||n||'@example.invalid','Final Baker '||n,'Free public','United States',true from generate_series(1,3) n;
insert into claims(entrant_id,task_key,proof,status)
select e.id,'m'||n,'YouTube: Synthetic · Score: 100%','verified' from entrants e cross join generate_series(1,7) n
where e.email like 'final%@example.invalid';
do $$
declare result json; picked_id uuid;
begin
  result:=admin_draw('local-only-test','5 lb bag','final_small','Synthetic December 1');
  if result->>'error' is not null then raise exception 'Final small draw failed: %',result; end if;
  select entrant_id into picked_id from draws where kind='final_small' limit 1;
  if exists(select 1 from _draw_pool('weekly') where entrant_id=picked_id)
    or exists(select 1 from _draw_pool('final_small') where entrant_id=picked_id) then raise exception 'Final winner can win another small bag'; end if;
  if not exists(select 1 from _draw_pool('grand') where entrant_id=picked_id) then raise exception 'Final winner lost grand eligibility'; end if;
  result:=admin_draw('local-only-test','5 lb bag','final_small','Synthetic December 1');
  if result->>'error' is not null then raise exception 'Second final small draw failed'; end if;
  if admin_draw('local-only-test','5 lb bag','final_small',null)->>'error'<>'prize_limit' then raise exception 'Third final small bag allowed'; end if;
  result:=admin_draw('local-only-test','Grand prize: 25 lb bag','grand','Synthetic Grand');
  if result->>'error' is not null then raise exception 'Grand draw failed'; end if;
  if admin_draw('local-only-test','Grand prize: 25 lb bag','grand',null)->>'error'<>'prize_limit' then raise exception 'Second grand prize allowed'; end if;
  if exists(select 1 from draws d join entrants e on e.id=d.entrant_id where e.is_test or e.disqualified) then raise exception 'Test/removed entry won'; end if;
  if exists(select entrant_id from draws where kind in ('weekly','final_small') group by entrant_id having count(*)>1) then raise exception 'Duplicate 5 lb winner'; end if;
  if has_function_privilege('anon','public._draw_pool(text)','execute') then raise exception 'Internal draw pool publicly exposed'; end if;
end $$;
-- Published Friday total: 4 bags on each of 7 dates = 28, without changing quantities.
insert into entrants(email,full_name,skool_name,country,rules_accepted)
select 'past'||n||'@example.invalid','Synthetic Past '||n,'Free public','United States',true from generate_series(1,27) n;
insert into draws(prize,entrant_id,entries,pool_size,kind)
select '5 lb bag',id,1,1,'weekly' from entrants where email like 'past%@example.invalid';
do $$
begin
  if admin_draw('local-only-test','5 lb bag','weekly',null)->>'error'<>'prize_limit' then raise exception '29th Friday bag allowed'; end if;
end $$;
rollback;
select 'PASS: 1/6/7-lesson pools, explicit test exclusion, shared small-win limit, retained grand eligibility, prize caps, legacy bypass closed; only rolled-back synthetic draws' as result;
