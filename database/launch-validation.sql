-- REVIEW ONLY. Apply to production only after deployment authorization.
-- Atomic and guarded against concurrent changes to the inspected live definitions.
-- Keeps all entrant records, tokens, original claim proof and statuses intact.
begin;
do $$
declare item record;
begin
  for item in select * from (values
    ('claim_task(uuid,text,text)', 'b831ff681df092953a0e0c260cc8d88b'),
    ('my_progress(uuid)', '289c9e1065927b9f8bf3f8f04ef4a4c6'),
    ('admin_review(text,uuid,text)', 'af62a97f214e4a98ef00020ba05cbc18'),
    ('admin_overview(text)', '545bd6b003020a2c1468cde2a144c46d'),
    ('admin_draw(text,text,text,text)', '6884b557c890fd3ef64fe718ebd95304'),
    ('admin_draw(text,text)', 'a037f439e55eab3a577f287852ca03fe'),
    ('leaderboard()', '5a86e65dedc6a4d97f72a565630d9b76'),
    ('stats()', '281319cbe5a9819d7b750ca9876e642d')
  ) as expected(signature, hash) loop
    if md5(pg_get_functiondef(('public.' || item.signature)::regprocedure)) <> item.hash then
      raise exception 'Live function changed: %. Reinspect before applying.', item.signature;
    end if;
  end loop;
  if md5(pg_get_viewdef('public._scores'::regclass, true)) <> '3372453de1d3fb88e40db269951bf702' then
    raise exception 'Live scoring view changed. Reinspect before applying.';
  end if;
end $$;

-- Explicit designation only. Existing entries default to false; no names,
-- email patterns or score values automatically designate anyone as a test.
alter table public.entrants add column is_test boolean not null default false;

-- The existing proof format is retained. Fractions are accepted ONLY when reading
-- historical claims; new submissions must contain a numeric percentage.
create or replace function public._lesson_percentage(p_proof text, p_legacy boolean default true)
returns numeric language plpgsql immutable set search_path = '' as $$
declare parts text[]; fraction text[]; score numeric;
begin
  if p_proof is null or length(p_proof) > 500 then return null; end if;
  parts := regexp_match(trim(p_proof), '^YouTube: ([^\r\n]{1,120}) · Score: (.+)$');
  if parts is null or trim(parts[1]) = '' or position(' · Score: ' in parts[1]) > 0 then return null; end if;
  if parts[2] ~ '^([0-9]+([.][0-9]+)?|[.][0-9]+)%?$' then
    score := rtrim(parts[2], '%')::numeric;
  elsif p_legacy then
    fraction := regexp_match(parts[2], '^([0-9]+([.][0-9]+)?|[.][0-9]+) (of|out of) ([0-9]+([.][0-9]+)?|[.][0-9]+)$');
    if fraction is null or fraction[4]::numeric <= 0 then return null; end if;
    score := 100 * fraction[1]::numeric / fraction[4]::numeric;
  else return null;
  end if;
  if score < 0 or score > 100 then return null; end if;
  return score;
end $$;
revoke all on function public._lesson_percentage(text, boolean) from public, anon, authenticated;

create or replace function public.claim_task(p_token uuid, p_task_key text, p_proof text)
returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_status text; v_cat text; v_new text; v_proof text; v_score numeric;
begin
  -- Serialize check-offs for this entry so an already-valid claim cannot be overwritten.
  select id into v_id from entrants where token = p_token and not disqualified for update;
  if v_id is null then return json_build_object('error','entrant'); end if;
  select category into v_cat from tasks where key = p_task_key and active;
  if v_cat is null then return json_build_object('error','task'); end if;
  select status, proof into v_status, v_proof from claims where entrant_id = v_id and task_key = p_task_key;
  if v_status = 'verified' and (v_cat <> 'module' or public._lesson_percentage(v_proof) >= 70) then
    return json_build_object('error','verified');
  end if;
  if v_cat = 'module' then
    v_score := public._lesson_percentage(p_proof, false);
    if v_score is null or v_score < 70 then return json_build_object('error','quiz_score'); end if;
  end if;
  -- Self-reported passing lessons count immediately; bonus claims still await review.
  v_new := case when v_cat = 'module' then 'verified' else 'pending' end;
  insert into claims(entrant_id, task_key, proof, status, reviewed_at)
  values (v_id, p_task_key, left(coalesce(p_proof,''),500), v_new, case when v_new='verified' then now() end)
  on conflict (entrant_id, task_key) do update
    set proof = excluded.proof, status = excluded.status, claimed_at = now(), reviewed_at = excluded.reviewed_at;
  return json_build_object('ok',true,'status',v_new);
end $$;

create or replace view public._scores as
select e.id as entrant_id,
  coalesce(sum(t.points) filter (where c.status='verified' and
    (t.category <> 'module' or public._lesson_percentage(c.proof) >= 70)),0)::integer as verified_points,
  coalesce(sum(t.points) filter (where c.status='pending' or
    (c.status='verified' and t.category='module' and coalesce(public._lesson_percentage(c.proof),0) < 70)),0)::integer as pending_points,
  (select count(*) from public.tasks m where m.category='module' and m.active) as modules_total,
  count(*) filter (where c.status='verified' and t.category='module' and public._lesson_percentage(c.proof) >= 70)::integer as modules_verified
from public.entrants e left join public.claims c on c.entrant_id=e.id
left join public.tasks t on t.key=c.task_key and t.active group by e.id;
revoke all on public._scores from public, anon, authenticated;

create or replace function public.my_progress(p_token uuid)
returns json language sql stable security definer set search_path = public as $$
select json_build_object(
  'first_name',split_part(e.full_name,' ',1),
  'verified_points',s.verified_points,'pending_points',s.pending_points,
  'modules_total',s.modules_total,'modules_verified',s.modules_verified,
  'is_test',e.is_test,
  'qualified',not e.disqualified and not e.is_test and s.modules_total>0 and s.modules_verified>=s.modules_total,
  'claims',coalesce((select json_agg(json_build_object(
    'task_key',c.task_key,
    'status',case when t.category='module' and c.status='verified' and coalesce(public._lesson_percentage(c.proof),0)<70 then 'pending' else c.status end,
    'needs_score',t.category='module' and coalesce(public._lesson_percentage(c.proof),0)<70,
    'proof',c.proof)) from public.claims c join public.tasks t on t.key=c.task_key where c.entrant_id=e.id),'[]'::json))
from public.entrants e join public._scores s on s.entrant_id=e.id where e.token=p_token;
$$;

create or replace function public.admin_review(p_key text, p_claim_id uuid, p_status text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not _is_admin(p_key) then return json_build_object('error','denied'); end if;
  if p_status not in ('pending','verified','rejected') then return json_build_object('error','status'); end if;
  if p_status='verified' and exists (
    select 1 from claims c join tasks t on t.key=c.task_key where c.id=p_claim_id
    and t.category='module' and coalesce(public._lesson_percentage(c.proof),0)<70
  ) then return json_build_object('error','quiz_score'); end if;
  update claims set status=p_status,reviewed_at=now() where id=p_claim_id;
  return json_build_object('ok',true);
end $$;

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
        'mill_status',e.mill_status,'experience',e.experience,'newsletter',e.newsletter,'disqualified',e.disqualified,'is_test',e.is_test,'preferred_grain',e.preferred_grain,
        'created_at',e.created_at,'verified_points',s.verified_points,'pending_points',s.pending_points,
        'modules_verified',s.modules_verified,'modules_total',s.modules_total,
        'claims', coalesce((select json_agg(json_build_object('id',c.id,'task_key',c.task_key,'status',case when t.category='module' and c.status='verified' and coalesce(public._lesson_percentage(c.proof),0)<70 then 'pending' else c.status end,'proof',c.proof,'claimed_at',c.claimed_at) order by c.claimed_at)
                 from claims c join tasks t on t.key=c.task_key where c.entrant_id=e.id),'[]'::json)) order by e.created_at)
      from entrants e join _scores s on s.entrant_id=e.id), '[]'::json),
    'draws', coalesce((select json_agg(json_build_object('prize',d.prize,'kind',d.kind,'label',d.label,'name',e.full_name,'email',e.email,'skool_name',e.skool_name,'preferred_grain',e.preferred_grain,
        'entries',d.entries,'pool_size',d.pool_size,'drawn_at',d.drawn_at) order by d.drawn_at desc)
      from draws d join entrants e on e.id=d.entrant_id), '[]'::json));
end $function$;

create or replace function public._draw_pool(p_kind text)
returns table(entrant_id uuid, weight integer) language sql stable set search_path = '' as $$
  select e.id,greatest(s.verified_points,1) from public.entrants e
  join public._scores s on s.entrant_id=e.id
  where not e.disqualified and not e.is_test
    and case
      when p_kind='weekly' then s.modules_verified>=1
      when p_kind in ('final_small','grand') then s.modules_total=7 and s.modules_verified=7
      else false end
    and not exists(select 1 from public.draws d where d.entrant_id=e.id
      and case when p_kind in ('weekly','final_small') then d.kind in ('weekly','final_small')
               when p_kind='grand' then d.kind='grand' else true end);
$$;
revoke all on function public._draw_pool(text) from public,anon,authenticated;

create or replace function public.admin_draw(p_key text,p_prize text,p_kind text default 'grand',p_label text default null)
returns json language plpgsql security definer set search_path = public as $$
declare picked record;
begin
  if not _is_admin(p_key) then return json_build_object('error','denied'); end if;
  if p_kind is null or p_kind not in ('weekly','final_small','grand') then return json_build_object('error','kind'); end if;
  if p_prize is distinct from (case when p_kind='grand' then 'Grand prize: 25 lb bag' else '5 lb bag' end) then
    return json_build_object('error','prize');
  end if;
  -- Serialize draws so concurrent requests cannot give one baker two small bags.
  perform pg_advisory_xact_lock(hashtextextended('ancient-grain-challenge-draw',0));
  if (p_kind='final_small' and (select count(*) from draws where kind='final_small')>=2)
    or (p_kind='grand' and (select count(*) from draws where kind='grand')>=1)
    or (p_kind='weekly' and (select count(*) from draws where kind='weekly')>=28) then
    return json_build_object('error','prize_limit');
  end if;
  with pool as materialized (select * from public._draw_pool(p_kind))
  select entrant_id,weight,(select count(*)::integer from pool) as pool_size into picked
  from pool order by -ln(1-random())/weight limit 1;
  if not found then return json_build_object('error','empty'); end if;
  insert into draws(prize,entrant_id,entries,pool_size,kind,label)
  values(p_prize,picked.entrant_id,picked.weight,picked.pool_size,p_kind,left(p_label,60));
  return (select json_build_object('name',full_name,'email',email,'skool_name',skool_name,
    'preferred_grain',preferred_grain,'entries',picked.weight,'pool_size',picked.pool_size)
    from entrants where id=picked.entrant_id);
end $$;

-- Remove the ambiguous old overload. Defaulted grand calls now use the same
-- guarded implementation; a small prize cannot be drawn through the grand pool.
drop function public.admin_draw(text,text);

create or replace function public.leaderboard()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(r order by r.points desc,r.joined),'[]'::json) from (
    select split_part(e.full_name,' ',1)||coalesce(' '||nullif(left(split_part(e.full_name,' ',2),1),'')||'.','') as name,
      s.verified_points as points,s.modules_total>0 and s.modules_verified>=s.modules_total as qualified,e.created_at as joined
    from entrants e join _scores s on s.entrant_id=e.id
    where not e.disqualified and not e.is_test order by s.verified_points desc,e.created_at limit 50) r;
$$;
create or replace function public.stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('entrants',(select count(*) from entrants where not disqualified and not is_test),
    'qualified',(select count(*) from entrants e join _scores s on s.entrant_id=e.id
      where not e.disqualified and not e.is_test and s.modules_total>0 and s.modules_verified>=s.modules_total));
$$;

-- Only replace the exact stale copy observed during this audit.
update public.tasks set description='Why rye dough does not behave like wheat. Watch the lesson, then take the quiz and pass at 70% or better.'
where key='m7' and description='Why rye dough does not behave like wheat. Take the quiz, and watch the lesson when the video is posted.';
update public.tasks set proof_hint='Enter your quiz percentage from 0 to 100. At least 70% is required.'
where category='module' and proof_hint='Tell us your quiz score, like 8 of 10. Leave it blank if the quiz is not posted yet.';
update public.tasks set link='https://recipepantry.app/fresh-milled'
where key in ('bake_grain','bake_fresh') and link='https://skoo.ly/fresh-mill-recipes';
commit;
