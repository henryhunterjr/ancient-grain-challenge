-- Add the NutriMill mixer without altering existing grain pools or prize caps.
-- Requires launch-validation.sql and the winner_fulfillment migration.
-- No entrants, points, or existing draws are modified. All replacements retain RPC ACLs.
begin;
create or replace function public._draw_pool(p_kind text)
returns table(entrant_id uuid, weight integer) language sql stable set search_path = '' as $$
  select e.id,case when p_kind='mixer' then 1+s.verified_points else greatest(s.verified_points,1) end from public.entrants e
  join public._scores s on s.entrant_id=e.id
  where not e.disqualified and not e.is_test
    and case
      when p_kind='mixer' then true
      when p_kind='weekly' then s.modules_verified>=1
      when p_kind in ('final_small','grand') then s.modules_total=7 and s.modules_verified=7
      else false end
    and not exists(select 1 from public.draws d where d.entrant_id=e.id
      and case when p_kind in ('weekly','final_small') then d.kind in ('weekly','final_small')
               when p_kind='grand' then d.kind='grand' when p_kind='mixer' then d.kind='mixer' else true end);
$$;
revoke all on function public._draw_pool(text) from public,anon,authenticated;

create or replace function public.admin_draw(p_key text,p_prize text,p_kind text default 'grand',p_label text default null)
returns json language plpgsql security definer set search_path = public as $$
declare picked record;
begin
  if not _is_admin(p_key) then return json_build_object('error','denied'); end if;
  if p_kind is null or p_kind not in ('weekly','final_small','grand','mixer') then return json_build_object('error','kind'); end if;
  if p_prize is distinct from (case when p_kind='mixer' then 'Bosch Universal Plus stand mixer' when p_kind='grand' then 'Grand prize: 25 lb bag' else '5 lb bag' end) then
    return json_build_object('error','prize');
  end if;
  -- Serialize every draw to retain grain limits and allow only one active mixer winner.
  perform pg_advisory_xact_lock(hashtextextended('ancient-grain-challenge-draw',0));
  if (p_kind='mixer' and exists(select 1 from draws d where d.kind='mixer'
      and not exists(select 1 from winner_fulfillment f where f.draw_id=d.id and f.status='forfeited')))
    or (p_kind='final_small' and (select count(*) from draws where kind='final_small')>=2)
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

create or replace function public._fulfillment_for_draw()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into winner_fulfillment(draw_id, grain)
  select new.id, case when new.kind='mixer' then '' else coalesce(e.preferred_grain,'') end from entrants e where e.id = new.entrant_id
  on conflict (draw_id) do nothing;
  return new;
end $function$;

create or replace function public.winner_claim_submit(p_claim uuid, p_grain text, p_ship_name text, p_address1 text, p_address2 text, p_city text, p_region text, p_postal text, p_country text, p_phone text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v winner_fulfillment; v_kind text;
begin
  select * into v from winner_fulfillment where claim_token = p_claim for update;
  if v.draw_id is null then return json_build_object('error','notfound'); end if;
  if v.status = 'forfeited' then return json_build_object('error','closed'); end if;
  if v.status in ('sent_to_partner','shipped') then return json_build_object('error','locked'); end if;
  select kind into v_kind from draws where id=v.draw_id;
  if v_kind<>'mixer' and length(trim(coalesce(p_grain,''))) < 2 then return json_build_object('error','grain'); end if;
  if length(trim(coalesce(p_ship_name,''))) < 2 then return json_build_object('error','name'); end if;
  if length(trim(coalesce(p_address1,''))) < 3 or length(trim(coalesce(p_city,''))) < 2
     or length(trim(coalesce(p_region,''))) < 2 or length(trim(coalesce(p_postal,''))) < 3
     or length(trim(coalesce(p_country,''))) < 2 then
    return json_build_object('error','address');
  end if;
  update winner_fulfillment set
    grain = case when v_kind='mixer' then '' else left(trim(p_grain),60) end, ship_name = left(trim(p_ship_name),120),
    address1 = left(trim(p_address1),160), address2 = left(trim(coalesce(p_address2,'')),160),
    city = left(trim(p_city),80), region = left(trim(p_region),80), postal = left(trim(p_postal),20),
    country = left(trim(p_country),60), phone = left(trim(coalesce(p_phone,'')),40),
    address_received_at = coalesce(address_received_at, now()),
    status = case when status in ('drawn','notified') then 'address_received' else status end,
    updated_at = now()
  where draw_id = v.draw_id;
  return json_build_object('ok', true);
end $function$;


-- Internal helpers remain private; the existing passcode/token-gated RPC grants remain in place.
revoke all on function public._draw_pool(text), public._fulfillment_for_draw() from public, anon, authenticated;
commit;
