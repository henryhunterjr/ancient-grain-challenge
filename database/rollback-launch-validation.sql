-- REVIEW ONLY: emergency rollback before any draws or confirmed test flags.
-- Restores the inspected pre-fix functions/view. This reopens known score and
-- eligibility bugs; it is NOT launch approval. Revert the frontend simultaneously.
-- Recovery PR #2 is untouched. Entrants, tokens, claims and proof stay intact.
begin;
select pg_advisory_xact_lock(hashtextextended('ancient-grain-challenge-draw',0));
do $$
declare item record;
begin
  if exists(select 1 from public.draws) then raise exception 'Draw history exists. Plan a reviewed rollback instead.'; end if;
  if exists(select 1 from public.entrants where is_test) then raise exception 'Approved test flags exist. Decide their rollback separately first.'; end if;
  for item in select * from (values
    ('admin_draw(text,text,text,text)','9793f624aabaffa36a2253e4ffaf54fb'),
    ('admin_overview(text)','ce24e0dcb132ba6939e5f2ff5c972648'),
    ('admin_review(text,uuid,text)','3016f0ddcf2b0bd531ec918f57c39c68'),
    ('claim_task(uuid,text,text)','d9c80a91f1e46ef3e787bdd17c348feb'),
    ('leaderboard()','0393a5688fb67085228b83f29c93ecad'),
    ('my_progress(uuid)','1c7362ea75c9a57d59df63ae12b9847d'),
    ('stats()','3cd79ba75aad505319864a75152bbcfd')
  ) expected(signature,hash) loop
    if md5(pg_get_functiondef(('public.'||item.signature)::regprocedure))<>item.hash then
      raise exception 'Function changed after this release: %. Reinspect.',item.signature;
    end if;
  end loop;
  if md5(pg_get_viewdef('public._scores'::regclass,true))<>'b6451123b7617e6e38ff4df150461304' then raise exception 'Scoring view changed; reinspect.'; end if;
end $$;
CREATE OR REPLACE FUNCTION public.admin_draw(p_key text, p_prize text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pool int; v_pick record;
begin
  if not _is_admin(p_key) then return json_build_object('error','denied'); end if;
  create temp table _pool on commit drop as
    select e.id, s.verified_points as w from entrants e join _scores s on s.entrant_id = e.id
    where not e.disqualified and s.modules_total > 0 and s.modules_verified >= s.modules_total
      and s.verified_points > 0 and e.id not in (select entrant_id from draws);
  select count(*) into v_pool from _pool;
  if v_pool = 0 then return json_build_object('error','empty'); end if;
  select id, w into v_pick from _pool order by -ln(1 - random()) / w limit 1;
  insert into draws(prize, entrant_id, entries, pool_size) values (left(p_prize,80), v_pick.id, v_pick.w, v_pool);
  return (select json_build_object('name',full_name,'email',email,'skool_name',skool_name,'entries',v_pick.w,'pool_size',v_pool)
          from entrants where id = v_pick.id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_draw(p_key text, p_prize text, p_kind text DEFAULT 'grand'::text, p_label text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pool int; v_pick record;
begin
  if not _is_admin(p_key) then return json_build_object('error','denied'); end if;
  if p_kind not in ('weekly','grand') then return json_build_object('error','kind'); end if;
  create temp table _pool on commit drop as
    select e.id, greatest(s.verified_points,1) as w from entrants e join _scores s on s.entrant_id = e.id
    where not e.disqualified
      and case when p_kind = 'weekly'
            then s.modules_verified >= 1 and e.id not in (select entrant_id from draws where kind = 'weekly')
            else s.modules_total > 0 and s.modules_verified >= s.modules_total and e.id not in (select entrant_id from draws where kind = 'grand')
          end;
  select count(*) into v_pool from _pool;
  if v_pool = 0 then return json_build_object('error','empty'); end if;
  select id, w into v_pick from _pool order by -ln(1 - random()) / w limit 1;
  insert into draws(prize, entrant_id, entries, pool_size, kind, label) values (left(p_prize,80), v_pick.id, v_pick.w, v_pool, p_kind, left(p_label,60));
  return (select json_build_object('name',full_name,'email',email,'skool_name',skool_name,'preferred_grain',preferred_grain,'entries',v_pick.w,'pool_size',v_pool)
          from entrants where id = v_pick.id);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_overview(p_key text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not _is_admin(p_key) then return json_build_object('error','denied'); end if;
  return json_build_object(
    'entrants', coalesce((select json_agg(json_build_object(
        'id',e.id,'full_name',e.full_name,'email',e.email,'skool_name',e.skool_name,'country',e.country,'region',e.region,
        'mill_status',e.mill_status,'experience',e.experience,'newsletter',e.newsletter,'disqualified',e.disqualified,'preferred_grain',e.preferred_grain,
        'created_at',e.created_at,'verified_points',s.verified_points,'pending_points',s.pending_points,
        'modules_verified',s.modules_verified,'modules_total',s.modules_total,
        'claims', coalesce((select json_agg(json_build_object('id',c.id,'task_key',c.task_key,'status',c.status,'proof',c.proof,'claimed_at',c.claimed_at) order by c.claimed_at)
                 from claims c where c.entrant_id=e.id),'[]'::json)) order by e.created_at)
      from entrants e join _scores s on s.entrant_id=e.id), '[]'::json),
    'draws', coalesce((select json_agg(json_build_object('prize',d.prize,'kind',d.kind,'label',d.label,'name',e.full_name,'email',e.email,'skool_name',e.skool_name,'preferred_grain',e.preferred_grain,
        'entries',d.entries,'pool_size',d.pool_size,'drawn_at',d.drawn_at) order by d.drawn_at desc)
      from draws d join entrants e on e.id=d.entrant_id), '[]'::json));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_review(p_key text, p_claim_id uuid, p_status text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not _is_admin(p_key) then return json_build_object('error','denied'); end if;
  if p_status not in ('pending','verified','rejected') then return json_build_object('error','status'); end if;
  update claims set status = p_status, reviewed_at = now() where id = p_claim_id;
  return json_build_object('ok', true);
end $function$;

CREATE OR REPLACE FUNCTION public.claim_task(p_token uuid, p_task_key text, p_proof text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_status text; v_cat text; v_new text;
begin
  select id into v_id from entrants where token = p_token and not disqualified;
  if v_id is null then return json_build_object('error','entrant'); end if;
  select category into v_cat from tasks where key = p_task_key and active;
  if v_cat is null then return json_build_object('error','task'); end if;
  select status into v_status from claims where entrant_id = v_id and task_key = p_task_key;
  if v_status = 'verified' then return json_build_object('error','verified'); end if;
  -- Lessons run on the honor system and count right away; bonus tasks wait for review.
  v_new := case when v_cat = 'module' then 'verified' else 'pending' end;
  insert into claims(entrant_id, task_key, proof, status, reviewed_at)
  values (v_id, p_task_key, left(coalesce(p_proof,''),500), v_new, case when v_new='verified' then now() end)
  on conflict (entrant_id, task_key) do update
    set proof = excluded.proof, status = excluded.status, claimed_at = now(), reviewed_at = excluded.reviewed_at;
  return json_build_object('ok', true, 'status', v_new);
end $function$;

CREATE OR REPLACE FUNCTION public.leaderboard()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(json_agg(r order by r.points desc, r.joined), '[]'::json) from (
    select split_part(e.full_name,' ',1) || coalesce(' ' || nullif(left(split_part(e.full_name,' ',2),1),'') || '.','') as name,
      s.verified_points as points,
      s.modules_total > 0 and s.modules_verified >= s.modules_total as qualified,
      e.created_at as joined
    from entrants e join _scores s on s.entrant_id = e.id
    where not e.disqualified order by s.verified_points desc, e.created_at limit 50) r;
$function$;

CREATE OR REPLACE FUNCTION public.my_progress(p_token uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'first_name', split_part(e.full_name,' ',1),
    'verified_points', s.verified_points, 'pending_points', s.pending_points,
    'modules_total', s.modules_total, 'modules_verified', s.modules_verified,
    'qualified', not e.disqualified and s.modules_total > 0 and s.modules_verified >= s.modules_total,
    'claims', coalesce((select json_agg(json_build_object('task_key',c.task_key,'status',c.status,'proof',c.proof))
                        from claims c where c.entrant_id = e.id), '[]'::json))
  from entrants e join _scores s on s.entrant_id = e.id where e.token = p_token;
$function$;

CREATE OR REPLACE FUNCTION public.stats()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object('entrants', (select count(*) from entrants where not disqualified),
    'qualified', (select count(*) from entrants e join _scores s on s.entrant_id=e.id
                  where not e.disqualified and s.modules_total>0 and s.modules_verified>=s.modules_total));
$function$;
create or replace view public._scores as
 SELECT e.id AS entrant_id,
    COALESCE(sum(t.points) FILTER (WHERE c.status = 'verified'::text), 0::bigint)::integer AS verified_points,
    COALESCE(sum(t.points) FILTER (WHERE c.status = 'pending'::text), 0::bigint)::integer AS pending_points,
    ( SELECT count(*) AS count FROM tasks m WHERE m.category = 'module'::text AND m.active) AS modules_total,
    count(*) FILTER (WHERE c.status = 'verified'::text AND t.category = 'module'::text)::integer AS modules_verified
   FROM entrants e LEFT JOIN claims c ON c.entrant_id = e.id LEFT JOIN tasks t ON t.key = c.task_key AND t.active GROUP BY e.id;
drop function public._draw_pool(text);
drop function public._lesson_percentage(text,boolean);
alter table public.entrants drop column is_test;
update public.tasks set description='Why rye dough does not behave like wheat. Take the quiz, and watch the lesson when the video is posted.'
where key='m7' and description='Why rye dough does not behave like wheat. Watch the lesson, then take the quiz and pass at 70% or better.';
update public.tasks set proof_hint='Tell us your quiz score, like 8 of 10. Leave it blank if the quiz is not posted yet.'
where category='module' and proof_hint='Enter your quiz percentage from 0 to 100. At least 70% is required.';
update public.tasks set link='https://skoo.ly/fresh-mill-recipes'
where key in ('bake_grain','bake_fresh') and link='https://recipepantry.app/fresh-milled';
commit;

