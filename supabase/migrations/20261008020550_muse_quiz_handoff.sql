-- REVIEW ONLY. Requires the launch-validation and entry-code recovery release.
-- No real entrant writes, draw calls, subscriptions or earlier migrations here.
begin;
do $$ begin
  if to_regprocedure('public._lesson_percentage(text,boolean)') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='entrants' and column_name='is_test')
    or has_function_privilege('anon','public.recover(text,text)','execute') then
    raise exception 'Publish the reviewed validation and entry-code recovery release first';
  end if;
  if (select count(*) from public.tasks where category='module' and active) <> 7
    or (select count(*) from public.tasks where key in ('m1','m2','m3','m4','m5','m6','m7') and category='module' and active) <> 7 then
    raise exception 'Canonical seven-lesson mapping changed. Reinspect before applying';
  end if;
end $$;

create table public.quiz_results (
  entrant_id uuid not null references public.entrants(id) on delete cascade,
  task_key text not null references public.tasks(key),
  quiz_id text not null,
  best_score numeric not null check(best_score >= 0 and best_score <= 100 and best_score::text not in ('NaN','Infinity','-Infinity')),
  question_total integer not null check(question_total between 1 and 100),
  received_at timestamptz not null,
  youtube_name text,
  primary key(entrant_id,task_key)
);
alter table public.quiz_results enable row level security;
revoke all on public.quiz_results from public,anon,authenticated;

-- IDs are public identifiers, not authentication. Keep the existing task IDs.
create function public._quiz_task(p_quiz text) returns text
language sql immutable set search_path='' as $$
 select case p_quiz
  when 'why-ancient-wheat-dough-feels-xht6epxj9xxxrrn' then 'm1'
  when 'the-kneading-fallacy-xox06exr433x0xoxm' then 'm2'
  when 'from-berries-to-bread-module-one-kj65x0xbgxctgu' then 'm3'
  when 'which-wheat-berry-xyr6exixztixzgi' then 'm4'
  when 'ancient-grain-sourdough-starter-jv6exlxjhxj67f' then 'm5'
  when 'mastering-einkorn-gs6exki0xyxbfxe' then 'm6'
  when 'rye-redefined-quiz-lxm6dxqxlxxkxoxkn' then 'm7' end;
$$;
revoke all on function public._quiz_task(text) from public,anon,authenticated;

-- Only creates/updates a claim when explicit comment details are already saved.
-- The existing self-report policy, scoring view and draw-time review remain intact.
create function public._complete_quiz_lesson(p_token uuid,p_task text) returns boolean
language plpgsql set search_path='' as $$
declare r public.quiz_results; result json;
begin
 select q.* into r from public.quiz_results q join public.entrants e on e.id=q.entrant_id
 where e.token=p_token and q.task_key=p_task;
 if r.best_score>=70 and r.youtube_name is not null then
  result := public.claim_task(p_token,p_task,'YouTube: '||r.youtube_name||' · Score: '||r.best_score||'%');
  if result->>'error' is not null and result->>'error'<>'verified' then raise exception 'Claim update failed'; end if;
 end if;
 return exists(select 1 from public.claims c join public.entrants e on e.id=c.entrant_id
  where e.token=p_token and c.task_key=p_task and c.status='verified' and public._lesson_percentage(c.proof)>=70);
end $$;
revoke all on function public._complete_quiz_lesson(uuid,text) from public,anon,authenticated;

create function public.record_quiz_score(p_token uuid,p_quiz_id text,p_score numeric,p_total integer)
returns json language plpgsql security definer set search_path='' as $$
declare eid uuid; task text; receipt timestamptz; saved public.quiz_results; complete boolean;
begin
 -- Same private entry-code authorization as claim_task; serialize all entry writes.
 select id into eid from public.entrants where token=p_token and not disqualified for update;
 if eid is null then return json_build_object('error','entrant'); end if;
 task := public._quiz_task(p_quiz_id);
 if task is null or not exists(select 1 from public.tasks where key=task and category='module' and active) then
  return json_build_object('error','quiz'); end if;
 if p_score is null or p_score::text in ('NaN','Infinity','-Infinity') or p_score<0 or p_score>100 then
  return json_build_object('error','score'); end if;
 if p_total is null or p_total<1 or p_total>100 then return json_build_object('error','total'); end if;
 receipt := clock_timestamp();
 -- Matches the existing public countdown, inclusive through Nov 29 23:59:59 EST.
 if receipt >= timestamptz '2026-11-30 05:00:00+00' then return json_build_object('error','closed'); end if;
 insert into public.quiz_results(entrant_id,task_key,quiz_id,best_score,question_total,received_at)
 values(eid,task,p_quiz_id,p_score,p_total,receipt)
 on conflict(entrant_id,task_key) do update set
  best_score=excluded.best_score,question_total=excluded.question_total,received_at=excluded.received_at
 where excluded.best_score>quiz_results.best_score;
 select * into saved from public.quiz_results where entrant_id=eid and task_key=task;
 complete := public._complete_quiz_lesson(p_token,task);
 return json_build_object('ok',true,'task_key',task,'best_score',saved.best_score,'passed',saved.best_score>=70,
  'received_at',saved.received_at,'lesson_complete',complete,'reporting','browser-reported');
end $$;
revoke all on function public.record_quiz_score(uuid,text,numeric,integer) from public;
grant execute on function public.record_quiz_score(uuid,text,numeric,integer) to anon,authenticated;

create function public.record_lesson_comment(p_token uuid,p_task_key text,p_youtube_name text)
returns json language plpgsql security definer set search_path='' as $$
declare eid uuid; yn text; complete boolean;
begin
 select id into eid from public.entrants where token=p_token and not disqualified for update;
 if eid is null then return json_build_object('error','entrant'); end if;
 yn := trim(p_youtube_name);
 if yn is null or length(yn)<1 or length(yn)>120 or yn ~ E'[\r\n]' or position(' · Score: ' in yn)>0 then
  return json_build_object('error','youtube_name'); end if;
 if clock_timestamp() >= timestamptz '2026-11-30 05:00:00+00' then return json_build_object('error','closed'); end if;
 update public.quiz_results q set youtube_name=yn
 where entrant_id=eid and task_key=p_task_key and exists(select 1 from public.tasks t where t.key=q.task_key and t.active and t.category='module');
 if not found then return json_build_object('error','score_required'); end if;
 complete := public._complete_quiz_lesson(p_token,p_task_key);
 return json_build_object('ok',true,'lesson_complete',complete);
end $$;
revoke all on function public.record_lesson_comment(uuid,text,text) from public;
grant execute on function public.record_lesson_comment(uuid,text,text) to anon,authenticated;

create function public.my_quiz_results(p_token uuid) returns json
language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.entrants where token=p_token and not disqualified) then
  coalesce((select json_agg(json_build_object('task_key',q.task_key,'best_score',q.best_score,
   'question_total',q.question_total,'received_at',q.received_at,'passed',q.best_score>=70,
   'youtube_name',q.youtube_name,'reporting','browser-reported'))
   from public.quiz_results q join public.entrants e on e.id=q.entrant_id where e.token=p_token),'[]'::json)
 else null end;
$$;
revoke all on function public.my_quiz_results(uuid) from public;
grant execute on function public.my_quiz_results(uuid) to anon,authenticated;
commit;
