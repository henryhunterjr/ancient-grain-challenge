-- Synthetic local data only. Run via tests/run-database.py, never in production.
insert into entrants(token,email,full_name,skool_name,country,rules_accepted,newsletter)
values ('11111111-1111-4111-8111-111111111111','muse-a@example.invalid','Alice Test','Other','United States',true,false),
 ('22222222-2222-4222-8222-222222222222','muse-b@example.invalid','Bob Test','Other','Canada',true,false);
do $$
declare a uuid := '11111111-1111-4111-8111-111111111111'; b uuid := '22222222-2222-4222-8222-222222222222';
 q text := 'from-berries-to-bread-module-one-kj65x0xbgxctgu'; r json; bad numeric; total int; prior_time timestamptz;
begin
 if record_quiz_score(gen_random_uuid(),q,80,10)->>'error'<>'entrant' then raise exception 'Unknown entry accepted'; end if;
 if record_quiz_score(null,q,80,10)->>'error'<>'entrant' then raise exception 'Anonymous accepted'; end if;
 if my_quiz_results(gen_random_uuid()) is not null then raise exception 'Invalid token reads'; end if;
 if record_quiz_score(a,'m3',80,10)->>'error'<>'quiz' then raise exception 'Wrong ID accepted'; end if;
 if record_quiz_score(a,'from-berry-to-bread-overview',80,10)->>'error'<>'quiz' then raise exception 'Overview accepted'; end if;
 foreach bad in array array[-1,101,'NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric,null] loop
  if record_quiz_score(a,q,bad,10)->>'error'<>'score' then raise exception 'Tampered score accepted: %',bad; end if;
 end loop;
 foreach total in array array[0,-1,101,null] loop
  if record_quiz_score(a,q,80,total)->>'error'<>'total' then raise exception 'Tampered total accepted'; end if;
 end loop;
 if record_lesson_comment(a,'m3','Test')->>'error'<>'score_required' then raise exception 'Comment without result accepted'; end if;
 r := record_quiz_score(a,q,0,5);
 if not (r->>'ok')::boolean or (r->>'passed')::boolean or (r->>'lesson_complete')::boolean then raise exception 'Zero result'; end if;
 if (my_progress(a)->>'modules_verified')::int<>0 then raise exception 'Score alone awarded credit'; end if;
 if json_array_length(my_quiz_results(b))<>0 then raise exception 'Other entry leaked'; end if;
 if record_lesson_comment(a,'m3',E'Test\nOther')->>'error'<>'youtube_name' then raise exception 'Invalid name accepted'; end if;
 r := record_lesson_comment(a,'m3','Alice on YouTube');
 if (r->>'lesson_complete')::boolean then raise exception 'Below passing comment awarded credit'; end if;
 r := record_quiz_score(a,q,69.999,10);
 if (r->>'passed')::boolean then raise exception 'Threshold rounded up'; end if;
 r := record_quiz_score(a,q,70,15);
 if not (r->>'passed')::boolean or not (r->>'lesson_complete')::boolean then raise exception 'Comment plus pass did not complete'; end if;
 prior_time := (r->>'received_at')::timestamptz;
 r := record_quiz_score(a,q,50,5);
 if (r->>'best_score')::numeric<>70 or (r->>'received_at')::timestamptz<>prior_time then raise exception 'Lower retake rewrote best'; end if;
 perform record_quiz_score(a,q,70,15);
 if (select count(*) from claims c join entrants e on e.id=c.entrant_id where e.token=a)<>1
   or (my_progress(a)->>'verified_points')::int<>20 then raise exception 'Repeat awarded twice'; end if;
 r := record_quiz_score(a,q,100,10);
 if (r->>'best_score')::int<>100 or (my_progress(a)->>'verified_points')::int<>20 then raise exception 'Higher retake'; end if;
 -- Pass before comment: no credit until explicit comment details arrive.
 perform record_quiz_score(b,q,80,10);
 if (my_progress(b)->>'modules_verified')::int<>0 then raise exception 'Passing score alone credited'; end if;
 r := record_lesson_comment(b,'m3','Bob on YouTube');
 if not (r->>'lesson_complete')::boolean then raise exception 'Comment second did not complete'; end if;
 update entrants set disqualified=true where token=b;
 if record_quiz_score(b,q,100,10)->>'error'<>'entrant' or my_quiz_results(b) is not null then raise exception 'Disqualified access'; end if;
 update entrants set disqualified=false where token=b;
 update tasks set active=false where key='m3';
 if record_quiz_score(a,q,100,10)->>'error'<>'quiz' then raise exception 'Inactive lesson accepted'; end if;
 update tasks set active=true where key='m3';
 if exists(select 1 from draws) then raise exception 'Unexpected draw'; end if;
 if exists(select 1 from entrants where email like 'muse-%' and newsletter) then raise exception 'Subscription created'; end if;
 if has_table_privilege('anon','public.quiz_results','select') or has_table_privilege('authenticated','public.quiz_results','insert') then raise exception 'Results table exposed'; end if;
 if has_function_privilege('anon','public._complete_quiz_lesson(uuid,text)','execute') then raise exception 'Helper exposed'; end if;
end $$;
set role anon;
do $$ begin
 if json_array_length(my_quiz_results('22222222-2222-4222-8222-222222222222'))<>1 then raise exception 'Own score RPC inaccessible'; end if;
 if my_quiz_results(gen_random_uuid()) is not null then raise exception 'Unknown bearer can read'; end if;
 begin
  perform * from public.quiz_results;
  raise exception 'Anonymous direct table read succeeded';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Test cutoff by changing only the disposable local function definitions in a
-- rolled-back transaction; no supplied timestamp/pass is accepted by the API.
begin;
do $$ declare r json; before_count int; begin
 execute replace(pg_get_functiondef('public.record_quiz_score(uuid,text,numeric,integer)'::regprocedure),'2026-11-30 05:00:00+00','2000-01-01 00:00:00+00');
 execute replace(pg_get_functiondef('public.record_lesson_comment(uuid,text,text)'::regprocedure),'2026-11-30 05:00:00+00','2000-01-01 00:00:00+00');
 select count(*) into before_count from quiz_results;
 r := record_quiz_score('11111111-1111-4111-8111-111111111111','mastering-einkorn-gs6exki0xyxbfxe',100,10);
 if r->>'error'<>'closed' or (select count(*) from quiz_results)<>before_count then raise exception 'Late save accepted'; end if;
 if record_lesson_comment('11111111-1111-4111-8111-111111111111','m3','Later')->>'error'<>'closed' then raise exception 'Late comment accepted'; end if;
end $$;
rollback;
select 'PASS: validation, ownership, pass/comment ordering, best retakes, points once, cutoff and permissions' as result;
