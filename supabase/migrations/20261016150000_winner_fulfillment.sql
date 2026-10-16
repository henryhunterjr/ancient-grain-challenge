-- Winner fulfillment desk: shipping details, status pipeline, claim links.
-- Adds one row per draw. Never changes draws, entrants, claims or the draw pools.

create table if not exists public.winner_fulfillment (
  draw_id uuid primary key references public.draws(id) on delete cascade,
  claim_token uuid not null unique default gen_random_uuid(),
  status text not null default 'drawn'
    check (status in ('drawn','notified','address_received','sent_to_partner','shipped','forfeited')),
  grain text not null default '',
  ship_name text not null default '',
  address1 text not null default '',
  address2 text not null default '',
  city text not null default '',
  region text not null default '',
  postal text not null default '',
  country text not null default '',
  phone text not null default '',
  tracking text not null default '',
  notes text not null default '',
  claim_expires_at timestamptz,
  notified_at timestamptz,
  reminded_at timestamptz,
  address_received_at timestamptz,
  sent_to_partner_at timestamptz,
  shipped_at timestamptz,
  announced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.winner_fulfillment enable row level security;
revoke all on public.winner_fulfillment from anon, authenticated;
grant all on public.winner_fulfillment to service_role;

-- Every new draw gets a fulfillment row seeded with the baker's registration grain pick.
create or replace function public._fulfillment_for_draw()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into winner_fulfillment(draw_id, grain)
  select new.id, coalesce(e.preferred_grain,'') from entrants e where e.id = new.entrant_id
  on conflict (draw_id) do nothing;
  return new;
end $function$;

drop trigger if exists draws_fulfillment on public.draws;
create trigger draws_fulfillment after insert on public.draws
  for each row execute function public._fulfillment_for_draw();

-- Backfill rows for draws that already happened.
insert into public.winner_fulfillment(draw_id, grain)
select d.id, coalesce(e.preferred_grain,'') from public.draws d join public.entrants e on e.id = d.entrant_id
on conflict (draw_id) do nothing;

-- Admin: full winner roster with fulfillment state.
create or replace function public.admin_winners(p_key text)
 returns json
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not _is_admin(p_key) then return json_build_object('error','denied'); end if;
  return coalesce((select json_agg(json_build_object(
      'draw_id', d.id, 'prize', d.prize, 'kind', d.kind, 'label', d.label, 'entries', d.entries, 'pool_size', d.pool_size, 'drawn_at', d.drawn_at,
      'entrant_id', e.id, 'full_name', e.full_name, 'email', e.email, 'skool_name', e.skool_name,
      'country', e.country, 'region', e.region, 'preferred_grain', e.preferred_grain,
      'modules_verified', s.modules_verified, 'verified_points', s.verified_points,
      'claim_token', f.claim_token, 'status', f.status, 'grain', f.grain,
      'ship_name', f.ship_name, 'address1', f.address1, 'address2', f.address2, 'city', f.city,
      'ship_region', f.region, 'postal', f.postal, 'ship_country', f.country, 'phone', f.phone,
      'tracking', f.tracking, 'notes', f.notes, 'claim_expires_at', f.claim_expires_at,
      'notified_at', f.notified_at, 'reminded_at', f.reminded_at, 'address_received_at', f.address_received_at,
      'sent_to_partner_at', f.sent_to_partner_at, 'shipped_at', f.shipped_at, 'announced_at', f.announced_at
    ) order by d.drawn_at desc)
    from draws d
    join entrants e on e.id = d.entrant_id
    join _scores s on s.entrant_id = e.id
    left join winner_fulfillment f on f.draw_id = d.id), '[]'::json);
end $function$;

-- Admin: record a pipeline event. Timestamps are kept; status moves forward with the event.
create or replace function public.admin_winner_mark(p_key text, p_draw_id uuid, p_event text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_status text;
begin
  if not _is_admin(p_key) then return json_build_object('error','denied'); end if;
  if p_event not in ('notified','reminded','address_received','sent_to_partner','shipped','announced','forfeited','unannounce') then
    return json_build_object('error','event');
  end if;
  insert into winner_fulfillment(draw_id, grain)
  select d.id, coalesce(e.preferred_grain,'') from draws d join entrants e on e.id = d.entrant_id where d.id = p_draw_id
  on conflict (draw_id) do nothing;
  select status into v_status from winner_fulfillment where draw_id = p_draw_id for update;
  if v_status is null then return json_build_object('error','draw'); end if;

  update winner_fulfillment set
    notified_at = case when p_event = 'notified' then now() else notified_at end,
    claim_expires_at = case when p_event = 'notified' then now() + interval '7 days' else claim_expires_at end,
    reminded_at = case when p_event = 'reminded' then now() else reminded_at end,
    address_received_at = case when p_event = 'address_received' then now() else address_received_at end,
    sent_to_partner_at = case when p_event = 'sent_to_partner' then now() else sent_to_partner_at end,
    shipped_at = case when p_event = 'shipped' then now() else shipped_at end,
    announced_at = case when p_event = 'announced' then now() when p_event = 'unannounce' then null else announced_at end,
    status = case
      when p_event = 'forfeited' then 'forfeited'
      when p_event = 'notified' and v_status = 'drawn' then 'notified'
      when p_event = 'address_received' and v_status in ('drawn','notified') then 'address_received'
      when p_event = 'sent_to_partner' and v_status in ('drawn','notified','address_received') then 'sent_to_partner'
      when p_event = 'shipped' and v_status <> 'forfeited' then 'shipped'
      else v_status end,
    updated_at = now()
  where draw_id = p_draw_id;
  return json_build_object('ok', true);
end $function$;

-- Admin: edit shipping fields, grain, tracking and notes by hand (for example from an email reply).
create or replace function public.admin_winner_edit(p_key text, p_draw_id uuid, p_fields json)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not _is_admin(p_key) then return json_build_object('error','denied'); end if;
  if not exists (select 1 from winner_fulfillment where draw_id = p_draw_id) then return json_build_object('error','draw'); end if;
  update winner_fulfillment set
    grain      = coalesce(left(p_fields->>'grain',60), grain),
    ship_name  = coalesce(left(p_fields->>'ship_name',120), ship_name),
    address1   = coalesce(left(p_fields->>'address1',160), address1),
    address2   = coalesce(left(p_fields->>'address2',160), address2),
    city       = coalesce(left(p_fields->>'city',80), city),
    region     = coalesce(left(p_fields->>'region',80), region),
    postal     = coalesce(left(p_fields->>'postal',20), postal),
    country    = coalesce(left(p_fields->>'country',60), country),
    phone      = coalesce(left(p_fields->>'phone',40), phone),
    tracking   = coalesce(left(p_fields->>'tracking',120), tracking),
    notes      = coalesce(left(p_fields->>'notes',2000), notes),
    updated_at = now()
  where draw_id = p_draw_id;
  return json_build_object('ok', true);
end $function$;

-- Admin: set or fix a draw's label (for example "Week 1 · Oct 16"). Labels show on the public winners list.
create or replace function public.admin_set_draw_label(p_key text, p_draw_id uuid, p_label text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not _is_admin(p_key) then return json_build_object('error','denied'); end if;
  update draws set label = nullif(left(trim(coalesce(p_label,'')),60),'') where id = p_draw_id;
  if not found then return json_build_object('error','draw'); end if;
  return json_build_object('ok', true);
end $function$;

-- Public: what a winner sees when they open their private claim link.
create or replace function public.winner_claim(p_claim uuid)
 returns json
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((select json_build_object(
      'first_name', split_part(e.full_name,' ',1),
      'prize', d.prize, 'kind', d.kind, 'label', d.label,
      'grain', f.grain, 'ship_name', f.ship_name, 'address1', f.address1, 'address2', f.address2,
      'city', f.city, 'region', f.region, 'postal', f.postal, 'country', f.country, 'phone', f.phone,
      'submitted', f.address_received_at is not null,
      'locked', f.status in ('sent_to_partner','shipped'),
      'closed', f.status = 'forfeited',
      'expires_at', f.claim_expires_at)
    from winner_fulfillment f join draws d on d.id = f.draw_id join entrants e on e.id = d.entrant_id
    where f.claim_token = p_claim), json_build_object('error','notfound'));
$function$;

-- Public: winner submits or corrects shipping details. Locked once the order goes to the partner.
create or replace function public.winner_claim_submit(p_claim uuid, p_grain text, p_ship_name text, p_address1 text, p_address2 text, p_city text, p_region text, p_postal text, p_country text, p_phone text)
 returns json
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v winner_fulfillment;
begin
  select * into v from winner_fulfillment where claim_token = p_claim for update;
  if v.draw_id is null then return json_build_object('error','notfound'); end if;
  if v.status = 'forfeited' then return json_build_object('error','closed'); end if;
  if v.status in ('sent_to_partner','shipped') then return json_build_object('error','locked'); end if;
  if length(trim(coalesce(p_grain,''))) < 2 then return json_build_object('error','grain'); end if;
  if length(trim(coalesce(p_ship_name,''))) < 2 then return json_build_object('error','name'); end if;
  if length(trim(coalesce(p_address1,''))) < 3 or length(trim(coalesce(p_city,''))) < 2
     or length(trim(coalesce(p_region,''))) < 2 or length(trim(coalesce(p_postal,''))) < 3
     or length(trim(coalesce(p_country,''))) < 2 then
    return json_build_object('error','address');
  end if;
  update winner_fulfillment set
    grain = left(trim(p_grain),60), ship_name = left(trim(p_ship_name),120),
    address1 = left(trim(p_address1),160), address2 = left(trim(coalesce(p_address2,'')),160),
    city = left(trim(p_city),80), region = left(trim(p_region),80), postal = left(trim(p_postal),20),
    country = left(trim(p_country),60), phone = left(trim(coalesce(p_phone,'')),40),
    address_received_at = coalesce(address_received_at, now()),
    status = case when status in ('drawn','notified') then 'address_received' else status end,
    updated_at = now()
  where draw_id = v.draw_id;
  return json_build_object('ok', true);
end $function$;

revoke all on function public._fulfillment_for_draw() from public, anon, authenticated;
revoke all on function public.admin_winners(text), public.admin_winner_mark(text,uuid,text),
  public.admin_winner_edit(text,uuid,json), public.admin_set_draw_label(text,uuid,text),
  public.winner_claim(uuid),
  public.winner_claim_submit(uuid,text,text,text,text,text,text,text,text,text)
  from public;
grant execute on function public.admin_winners(text), public.admin_winner_mark(text,uuid,text),
  public.admin_winner_edit(text,uuid,json), public.admin_set_draw_label(text,uuid,text),
  public.winner_claim(uuid),
  public.winner_claim_submit(uuid,text,text,text,text,text,text,text,text,text)
  to anon, authenticated, service_role;
