-- Applied October 14, 2026. Preserve existing passcode authorization.
-- Entry codes are returned only after the existing _is_admin check succeeds.
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
        'id',e.id,'entry_code',e.token,'full_name',e.full_name,'email',e.email,'skool_name',e.skool_name,'country',e.country,'region',e.region,
        'mill_status',e.mill_status,'experience',e.experience,'newsletter',e.newsletter,'disqualified',e.disqualified,'is_test',e.is_test,'preferred_grain',e.preferred_grain,
        'created_at',e.created_at,'verified_points',s.verified_points,'pending_points',s.pending_points,
        'modules_verified',s.modules_verified,'modules_total',s.modules_total,
        'claims', coalesce((select json_agg(json_build_object('id',c.id,'task_key',c.task_key,'status',case when t.category='module' and c.status='verified' and coalesce(public._lesson_percentage(c.proof),0)<70 then 'pending' else c.status end,'proof',c.proof,'claimed_at',c.claimed_at) order by c.claimed_at)
                 from claims c join tasks t on t.key=c.task_key where c.entrant_id=e.id),'[]'::json)) order by e.created_at)
      from entrants e join _scores s on s.entrant_id=e.id), '[]'::json),
    'draws', coalesce((select json_agg(json_build_object('prize',d.prize,'kind',d.kind,'label',d.label,'name',e.full_name,'email',e.email,'skool_name',e.skool_name,'preferred_grain',e.preferred_grain,
        'entries',d.entries,'pool_size',d.pool_size,'drawn_at',d.drawn_at) order by d.drawn_at desc)
      from draws d join entrants e on e.id=d.entrant_id), '[]'::json));
end $function$
