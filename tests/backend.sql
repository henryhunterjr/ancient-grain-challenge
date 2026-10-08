-- LOCAL ONLY. Run after baseline-schema.sql and launch-validation.sql.
begin;
insert into tasks(key,title,category,points) select 'm'||n,'Lesson '||n,'module',20 from generate_series(1,7) n on conflict (key) do nothing;
insert into tasks(key,title,category,points) values ('bonus','Bonus','bonus',5);
insert into settings(key,value) values ('admin_hash',encode(extensions.digest('local-only-test','sha256'),'hex'));
insert into entrants(email,full_name,skool_name,country,rules_accepted)
values ('synthetic@example.invalid','Synthetic Baker','Free public entry','United States',true);

do $$
declare code uuid; eid uuid; result json; bad text; claim_id uuid; before_proof text;
begin
  select token,id into code,eid from entrants where email='synthetic@example.invalid';
  if (select description from tasks where key='m7') like '%when the video is posted%' then raise exception 'Stale Rye copy remains'; end if;
  if (select proof_hint from tasks where key='m7') like '%Leave it blank%' then raise exception 'Stale score hint remains'; end if;
  if exists(select 1 from tasks where key in ('bake_grain','bake_fresh') and link<>'https://recipepantry.app/fresh-milled') then raise exception 'Shortener links remain'; end if;
  foreach bad in array array['', ' ', 'YouTube: Baker', 'YouTube: Baker · Score: ',
    'YouTube: Baker · Score: NaN','YouTube: Baker · Score: Infinity','YouTube: Baker · Score: -1%',
    'YouTube: Baker · Score: 101%','YouTube: Baker · Score: 69.999%',
    'YouTube: Baker · Score: 8 of 10','YouTube: Baker · Score: 1e2',
    'YouTube: Baker · Score: 0x50','YouTube: Baker · Score: 80abc',
    'YouTube:   · Score: 80%', E'YouTube: Baker\nOther · Score: 80%'] loop
    result := claim_task(code,'m1',bad);
    if result->>'error' is distinct from 'quiz_score' then raise exception 'Accepted invalid score: %',bad; end if;
    if exists(select 1 from claims where entrant_id=eid) then raise exception 'Invalid submission wrote a claim'; end if;
  end loop;
  result := claim_task(code,'m1',null);
  if result->>'error' is distinct from 'quiz_score' then raise exception 'Accepted null'; end if;
  foreach bad in array array['0','100.001','NaN','Infinity','-Infinity','8 of 0','11 of 10','6 of 10','69.99%'] loop
    if coalesce(_lesson_percentage('YouTube: Baker · Score: '||bad),0)>=70 then raise exception 'Invalid legacy passed: %',bad; end if;
  end loop;
  if _lesson_percentage('YouTube: Baker · Score: 8 of 10')<>80
    or _lesson_percentage('YouTube: Baker · Score: 7 out of 10')<>70 then raise exception 'Valid historical fractions lost'; end if;
  result := claim_task(code,'m1','YouTube: Baker · Score: 70%');
  if result->>'status'<>'verified' then raise exception '70 boundary rejected'; end if;
  if (select modules_verified from _scores where entrant_id=eid)<>1 then raise exception 'Passing claim not counted'; end if;
  if exists(select 1 from _scores where entrant_id=eid and modules_verified>=modules_total) then raise exception 'One lesson final-qualified'; end if;
  -- Backend preserves an already-valid proof; no repeated completion/rewrite.
  select proof into before_proof from claims where entrant_id=eid and task_key='m1';
  result := claim_task(code,'m1','YouTube: Baker · Score: 100%');
  if result->>'error'<>'verified' or (select proof from claims where entrant_id=eid and task_key='m1')<>before_proof then raise exception 'Valid claim overwritten'; end if;
  result := claim_task(code,'m2','YouTube: Baker · Score: 100%');
  if result->>'status'<>'verified' then raise exception '100 boundary rejected'; end if;
  result := claim_task(code,'m3','YouTube: Baker · Score: 70.5%');
  if result->>'status'<>'verified' then raise exception 'Decimal rejected'; end if;
  -- Historical valid proof is preserved, while missing score stays stored but does not count.
  insert into claims(entrant_id,task_key,proof,status) values
    (eid,'m4','YouTube: Baker · Score: 8 of 10','verified'),
    (eid,'m5','YouTube: Baker','verified');
  if (select modules_verified from _scores where entrant_id=eid)<>4 then raise exception 'Legacy eligibility wrong'; end if;
  if (select status from claims where entrant_id=eid and task_key='m5')<>'verified' then raise exception 'Historical record mutated'; end if;
  result := my_progress(code);
  if not exists(select 1 from json_array_elements(result->'claims') c where c->>'task_key'='m5' and c->>'status'='pending' and (c->>'needs_score')::boolean) then raise exception 'Invalid historical lesson shown done'; end if;
  select id into claim_id from claims where entrant_id=eid and task_key='m5';
  result := admin_review('local-only-test',claim_id,'verified');
  if result->>'error'<>'quiz_score' then raise exception 'Admin validation bypass'; end if;
  result := admin_overview('local-only-test');
  if not exists(select 1 from json_array_elements(result->'entrants') e, json_array_elements(e->'claims') c where c->>'task_key'='m5' and c->>'status'='pending') then raise exception 'Host Desk cannot see invalid historical claim'; end if;
  -- Unlimited quiz retakes remain possible; corrected self-report can complete an invalid historical claim.
  result := claim_task(code,'m5','YouTube: Baker · Score: 80%');
  if result->>'status'<>'verified' then raise exception 'Historical invalid claim cannot be corrected'; end if;
  perform claim_task(code,'m6','YouTube: Baker · Score: 80%');
  perform claim_task(code,'m7','YouTube: Baker · Score: 80%');
  if not (my_progress(code)->>'qualified')::boolean then raise exception 'Seven passing lessons not qualified'; end if;
  result := claim_task(code,'bonus','https://example.invalid/bake');
  if result->>'status'<>'pending' then raise exception 'Bonus review changed'; end if;
  if (select verified_points from _scores where entrant_id=eid)<>140 then raise exception 'Pending bonus counted'; end if;
  update entrants set disqualified=true where id=eid;
  if (my_progress(code)->>'qualified')::boolean then raise exception 'Disqualified entrant final-qualified'; end if;
  if claim_task(code,'m1','YouTube: Baker · Score: 80%')->>'error'<>'entrant' then raise exception 'Removed entry can claim'; end if;
  -- This score test never executes a draw. Draw behavior has separate synthetic tests.
  if (select count(*) from draws)<>0 then raise exception 'A draw was created'; end if;
  if has_table_privilege('anon','public._scores','select') then raise exception 'Scores view exposed'; end if;
end $$;
set local role anon;
do $$
begin
  if exists(select 1 from entrants) then raise exception 'RLS leaks entrants'; end if;
  if has_function_privilege(current_user,'public._lesson_percentage(text,boolean)','execute') then raise exception 'Internal helper exposed'; end if;
  if not has_function_privilege(current_user,'public.claim_task(uuid,text,text)','execute') then raise exception 'Public RPC lost access'; end if;
end $$;
rollback;
select 'PASS: score validation, historical data, eligibility, admin guard and RLS; no draws executed' as result;
