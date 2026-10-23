-- Two optional quiz bonuses; keep the original seven required modules unchanged.
-- Henry authorized 20 points once for each bonus on October 23, 2026.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '45s';
do $$
declare r record;
begin
  if (select count(*) from public.tasks where category='module' and active) <> 7 then
    raise exception 'Required lesson mapping changed; inspect before release';
  end if;
  for r in select * from (values
    ('claim_task(uuid,text,text)','abf051fb2c9da6340f0eed57ab6cda43'),
    ('record_quiz_score(uuid,text,numeric,integer)','63c4b34055e0289be7034164760ef461'),
    ('record_lesson_comment(uuid,text,text)','c72747a5ec4d530c67df1800c959993c'),
    ('my_quiz_results(uuid)','23ca4f547062ef8f17faf3a527c87194'),
    ('_complete_quiz_lesson(uuid,text)','3c298e9c1569c08ce24dd6c5e5b0ca7a'),
    ('_quiz_task(text)','653468953ffbbd2eccced402159db10f')
  ) as expected(signature,hash) loop
    if md5(pg_get_functiondef(('public.'||r.signature)::regprocedure))<>r.hash then
      raise exception 'Quiz function changed: %. Reinspect before applying.',r.signature;
    end if;
  end loop;
  if exists(select 1 from public.tasks where key in ('b_dense','b_sprouted')) then
    raise exception 'Bonus keys already exist; reconcile before applying';
  end if;
end $$;

insert into public.tasks(key,title,description,category,points,proof_hint,link,sort,active) values
('b_dense','Why Your Fresh-Milled Sourdough Is Dense','Watch the lesson, pass at 80%, save your quiz score, and confirm your YouTube comment. Earn 20 points once. Does not replace a required lesson.','bonus',20,'Use the quiz results button to save your score and comment.','https://challenge.bakinggreatbread.com/quizzes/why-your-fresh-milled-sourdough-is-dense/',170,true),
('b_sprouted','Waking Up the Berry Quiz','Watch the lesson, pass at 70%, save your quiz score, and confirm your YouTube comment. Earn 20 points once. Does not replace a required lesson.','bonus',20,'Use the quiz results button to save your score and comment.','https://challenge.bakinggreatbread.com/quiz?quiz=waking-up-the-berry-quiz-wxp6iak2yanw',180,true);

create or replace function public._quiz_task(p_quiz text) returns text
language sql immutable set search_path='' as $$
 select case p_quiz
  when 'why-ancient-wheat-dough-feels-xht6epxj9xxxrrn' then 'm1'
  when 'the-kneading-fallacy-xox06exr433x0xoxm' then 'm2'
  when 'from-berries-to-bread-module-one-kj65x0xbgxctgu' then 'm3'
  when 'which-wheat-berry-xyr6exixztixzgi' then 'm4'
  when 'ancient-grain-sourdough-starter-jv6exlxjhxj67f' then 'm5'
  when 'mastering-einkorn-gs6exki0xyxbfxe' then 'm6'
  when 'rye-redefined-quiz-lxm6dxqxlxxkxoxkn' then 'm7'
  when 'why-your-fresh-milled-sourdough-is-xih6muguvxwc6' then 'b_dense'
  when 'waking-up-the-berry-quiz-wxp6iak2yanw' then 'b_sprouted' end;
$$;
create function public._quiz_pass_mark(p_task text) returns integer
language sql immutable set search_path='' as $$
 select case when p_task='b_dense' then 80 when p_task='b_sprouted' or p_task in ('m1','m2','m3','m4','m5','m6','m7') then 70 end;
$$;
revoke all on function public._quiz_task(text),public._quiz_pass_mark(text) from public,anon,authenticated;

create or replace function public.claim_task(p_token uuid,p_task_key text,p_proof text)
returns json language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_status text; v_cat text; v_new text; v_proof text; v_score numeric;
  v_quiz_bonus boolean := p_task_key in ('b_dense','b_sprouted');
begin
  select id into v_id from entrants where token=p_token and not disqualified for update;
  if v_id is null then return json_build_object('error','entrant'); end if;
  select category into v_cat from tasks where key=p_task_key and active;
  if v_cat is null then return json_build_object('error','task'); end if;
  select status,proof into v_status,v_proof from claims where entrant_id=v_id and task_key=p_task_key;
  if v_status='verified' and (v_cat<>'module' or public._lesson_percentage(v_proof)>=70) then
    return json_build_object('error','verified');
  end if;
  if v_cat='module' or v_quiz_bonus then
    v_score:=public._lesson_percentage(p_proof,false);
    if v_score is null or v_score<coalesce(public._quiz_pass_mark(p_task_key),70) then
      return json_build_object('error','quiz_score'); end if;
  end if;
  -- A generic bonus check-off must not bypass the saved score/comment flow.
  if v_quiz_bonus and not exists(select 1 from public.quiz_results q where q.entrant_id=v_id and q.task_key=p_task_key
    and q.best_score>=public._quiz_pass_mark(p_task_key) and q.youtube_name is not null
    and p_proof='YouTube: '||q.youtube_name||' · Score: '||q.best_score||'%') then
    return json_build_object('error','score_required');
  end if;
  v_new:=case when v_cat='module' or v_quiz_bonus then 'verified' else 'pending' end;
  insert into claims(entrant_id,task_key,proof,status,reviewed_at)
  values(v_id,p_task_key,left(coalesce(p_proof,''),500),v_new,case when v_new='verified' then now() end)
  on conflict(entrant_id,task_key) do update set proof=excluded.proof,status=excluded.status,
    claimed_at=now(),reviewed_at=excluded.reviewed_at;
  return json_build_object('ok',true,'status',v_new);
end $$;

create or replace function public._complete_quiz_lesson(p_token uuid,p_task text) returns boolean
language plpgsql set search_path='' as $$
declare r public.quiz_results; result json;
begin
 select q.* into r from public.quiz_results q join public.entrants e on e.id=q.entrant_id
 where e.token=p_token and q.task_key=p_task;
 if r.best_score>=public._quiz_pass_mark(p_task) and r.youtube_name is not null then
  result:=public.claim_task(p_token,p_task,'YouTube: '||r.youtube_name||' · Score: '||r.best_score||'%');
  if result->>'error' is not null and result->>'error'<>'verified' then raise exception 'Claim update failed'; end if;
 end if;
 return exists(select 1 from public.claims c join public.entrants e on e.id=c.entrant_id
  where e.token=p_token and c.task_key=p_task and c.status='verified'
    and public._lesson_percentage(c.proof)>=public._quiz_pass_mark(p_task));
end $$;

create or replace function public.record_quiz_score(p_token uuid,p_quiz_id text,p_score numeric,p_total integer)
returns json language plpgsql security definer set search_path='' as $$
declare eid uuid; task text; receipt timestamptz; saved public.quiz_results; complete boolean;
begin
 select id into eid from public.entrants where token=p_token and not disqualified for update;
 if eid is null then return json_build_object('error','entrant'); end if;
 task:=public._quiz_task(p_quiz_id);
 if task is null or not exists(select 1 from public.tasks where key=task and active
   and (category='module' or key in ('b_dense','b_sprouted'))) then return json_build_object('error','quiz'); end if;
 if p_score is null or p_score::text in ('NaN','Infinity','-Infinity') or p_score<0 or p_score>100 then return json_build_object('error','score'); end if;
 if p_total is null or p_total<1 or p_total>100 then return json_build_object('error','total'); end if;
 receipt:=clock_timestamp();
 if receipt>=timestamptz '2026-11-30 05:00:00+00' then return json_build_object('error','closed'); end if;
 insert into public.quiz_results(entrant_id,task_key,quiz_id,best_score,question_total,received_at)
 values(eid,task,p_quiz_id,p_score,p_total,receipt)
 on conflict(entrant_id,task_key) do update set best_score=excluded.best_score,question_total=excluded.question_total,received_at=excluded.received_at
 where excluded.best_score>quiz_results.best_score;
 select * into saved from public.quiz_results where entrant_id=eid and task_key=task;
 complete:=public._complete_quiz_lesson(p_token,task);
 return json_build_object('ok',true,'task_key',task,'best_score',saved.best_score,'passed',saved.best_score>=public._quiz_pass_mark(task),
   'pass_mark',public._quiz_pass_mark(task),'received_at',saved.received_at,'lesson_complete',complete,'reporting','browser-reported');
end $$;

create or replace function public.record_lesson_comment(p_token uuid,p_task_key text,p_youtube_name text)
returns json language plpgsql security definer set search_path='' as $$
declare eid uuid; yn text; complete boolean;
begin
 select id into eid from public.entrants where token=p_token and not disqualified for update;
 if eid is null then return json_build_object('error','entrant'); end if;
 yn:=trim(p_youtube_name);
 if yn is null or length(yn)<1 or length(yn)>120 or yn ~ E'[\r\n]' or position(' · Score: ' in yn)>0 then return json_build_object('error','youtube_name'); end if;
 if clock_timestamp()>=timestamptz '2026-11-30 05:00:00+00' then return json_build_object('error','closed'); end if;
 update public.quiz_results q set youtube_name=yn where entrant_id=eid and task_key=p_task_key
   and exists(select 1 from public.tasks t where t.key=q.task_key and t.active
     and (t.category='module' or t.key in ('b_dense','b_sprouted')));
 if not found then return json_build_object('error','score_required'); end if;
 complete:=public._complete_quiz_lesson(p_token,p_task_key);
 return json_build_object('ok',true,'lesson_complete',complete);
end $$;

create or replace function public.my_quiz_results(p_token uuid) returns json
language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.entrants where token=p_token and not disqualified) then
  coalesce((select json_agg(json_build_object('task_key',q.task_key,'best_score',q.best_score,'question_total',q.question_total,
    'received_at',q.received_at,'passed',q.best_score>=public._quiz_pass_mark(q.task_key),'pass_mark',public._quiz_pass_mark(q.task_key),
    'youtube_name',q.youtube_name,'reporting','browser-reported'))
    from public.quiz_results q join public.entrants e on e.id=q.entrant_id where e.token=p_token),'[]'::json)
 else null end;
$$;
revoke all on function public._complete_quiz_lesson(uuid,text) from public,anon,authenticated;

-- Email counts use the same verified points as the live entry and draw pool.
-- Include public quiz links and per-quiz pass marks in unfinished bonus items.
create or replace function agc_entry_recovery.progress_mail_list_v2()
 returns table(entrant_id uuid,email text,first_name text,is_test boolean,lessons_done int,
   next_key text,next_title text,quiz_passed boolean,last_sent_at timestamptz,entries int,next_points int,open_bonus jsonb)
 language sql stable security definer set search_path='' as $$
 with mods as(select key,title,sort from public.tasks where category='module' and active),
 e as(select * from public.entrants where not coalesce(disqualified,false) or coalesce(is_test,false)),
 nxt as(select e.id,(select m.key from mods m where not exists(select 1 from public.claims c
   where c.entrant_id=e.id and c.task_key=m.key and c.status='verified') order by m.sort,m.key limit 1) k from e)
 select e.id,lower(btrim(e.email::text)),initcap(split_part(btrim(e.full_name),' ',1)),coalesce(e.is_test,false),
 s.modules_verified,n.k,(select title from mods where key=n.k),
 n.k is not null and exists(select 1 from public.quiz_results q where q.entrant_id=e.id and q.task_key=n.k and q.best_score>=70),
 (select max(sent_at) from agc_entry_recovery.progress_mail_log l where l.entrant_id=e.id),
 1+s.verified_points,(select points from public.tasks where key=n.k),
 coalesce((select jsonb_agg(jsonb_build_object('key',t.key,'title',t.title,'points',t.points,'link',t.link,
   'pass_mark',public._quiz_pass_mark(t.key)) order by t.sort)
   from public.tasks t where t.category<>'module' and t.active and not exists(select 1 from public.claims c
     where c.entrant_id=e.id and c.task_key=t.key and c.status in ('verified','pending'))),'[]'::jsonb)
 from e join public._scores s on s.entrant_id=e.id join nxt n on n.id=e.id;
$$;
revoke all on function agc_entry_recovery.progress_mail_list_v2() from public,anon,authenticated;
commit;
