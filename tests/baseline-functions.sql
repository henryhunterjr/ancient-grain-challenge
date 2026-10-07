CREATE OR REPLACE FUNCTION public._is_admin(p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select exists (select 1 from settings where key = 'admin_hash'
    and value = encode(extensions.digest(coalesce(p_key,''), 'sha256'), 'hex'));
$function$;

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

CREATE OR REPLACE FUNCTION public.admin_set_disqualified(p_key text, p_entrant uuid, p_value boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not _is_admin(p_key) then return json_build_object('error','denied'); end if;
  update entrants set disqualified = p_value where id = p_entrant;
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

CREATE OR REPLACE FUNCTION public.get_tasks()
 RETURNS SETOF tasks
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from tasks where active order by sort, key;
$function$;

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

CREATE OR REPLACE FUNCTION public.recover(p_email text, p_skool_name text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select json_build_object('token', token) from entrants
    where email = lower(trim(p_email)) and lower(trim(full_name)) = lower(trim(p_skool_name))),
    json_build_object('error','notfound'));
$function$;

CREATE OR REPLACE FUNCTION public.register(p_email text, p_full_name text, p_skool_name text, p_country text, p_region text, p_mill_status text, p_experience text, p_newsletter boolean, p_rules_accepted boolean, p_grain text DEFAULT ''::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare v entrants;
begin
  if coalesce(p_rules_accepted,false) = false then return json_build_object('error','rules'); end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return json_build_object('error','email'); end if;
  if length(trim(coalesce(p_full_name,''))) < 2 or length(trim(coalesce(p_skool_name,''))) < 2 then
    return json_build_object('error','name'); end if;
  if length(trim(coalesce(p_grain,''))) < 2 then return json_build_object('error','grain'); end if;
  if exists (select 1 from entrants where email = lower(trim(p_email))) then
    return json_build_object('error','exists'); end if;
  insert into entrants(email, full_name, skool_name, country, region, mill_status, experience, newsletter, rules_accepted, preferred_grain)
  values (lower(trim(p_email)), left(trim(p_full_name),120), left(trim(p_skool_name),120), left(p_country,60),
          left(coalesce(p_region,''),80), left(coalesce(p_mill_status,''),80), left(coalesce(p_experience,''),80),
          coalesce(p_newsletter,true), true, left(trim(p_grain),60))
  returning * into v;
  return json_build_object('token', v.token);
end $function$;

CREATE OR REPLACE FUNCTION public.register(p_email text, p_full_name text, p_skool_name text, p_country text, p_region text, p_mill_status text, p_experience text, p_newsletter boolean, p_rules_accepted boolean)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select json_build_object('error','grain') $function$;

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

CREATE OR REPLACE FUNCTION public.winners()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(json_agg(json_build_object(
    'name', split_part(e.full_name,' ',1) || coalesce(' ' || nullif(left(split_part(e.full_name,' ',2),1),'') || '.',''),
    'from', e.skool_name, 'region', e.region, 'prize', d.prize, 'kind', d.kind, 'label', d.label, 'drawn_at', d.drawn_at) order by d.drawn_at desc), '[]'::json)
  from draws d join entrants e on e.id = d.entrant_id;
$function$;

