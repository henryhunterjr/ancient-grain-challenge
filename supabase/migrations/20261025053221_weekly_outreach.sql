-- Additive release. Apply before deploying progress-mail v3 and Host Desk assets.
-- Existing entries, claims, draws, scores and send history are untouched.
create table agc_entry_recovery.outreach_settings (
  id boolean primary key default true check (id),
  value jsonb not null default '{}'::jsonb
);
alter table agc_entry_recovery.outreach_settings enable row level security;
revoke all on agc_entry_recovery.outreach_settings from public, anon, authenticated;
insert into agc_entry_recovery.outreach_settings(id) values (true);

create table agc_entry_recovery.entry_sources (
  entrant_id uuid primary key references public.entrants(id) on delete cascade,
  source jsonb not null,
  recorded_at timestamptz not null default now()
);
alter table agc_entry_recovery.entry_sources enable row level security;
revoke all on agc_entry_recovery.entry_sources from public, anon, authenticated;

create function public.admin_outreach_get(p_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not public._is_admin(p_key) then return jsonb_build_object('error','denied'); end if;
  return (select value || jsonb_build_object('sources', coalesce((
    select jsonb_object_agg(s.entrant_id::text, s.source) from agc_entry_recovery.entry_sources s
  ), '{}'::jsonb)) from agc_entry_recovery.outreach_settings where id);
end $$;
revoke all on function public.admin_outreach_get(text) from public;
grant execute on function public.admin_outreach_get(text) to anon, authenticated;

create function public.admin_outreach_save(p_key text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; roster jsonb; campaign jsonb; emails jsonb;
begin
  if not public._is_admin(p_key) then return jsonb_build_object('error','denied'); end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>3000000
    or exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('roster','campaign')) then
    return jsonb_build_object('error','request'); end if;
  select value into result from agc_entry_recovery.outreach_settings where id for update;
  if p_patch ? 'roster' then
    roster := p_patch->'roster';
    if jsonb_typeof(roster)<>'object' or jsonb_typeof(roster->'emails') is distinct from 'array' then return jsonb_build_object('error','roster'); end if;
    if jsonb_array_length(roster->'emails') not between 1 and 20000 then return jsonb_build_object('error','roster'); end if;
    if exists(select 1 from jsonb_array_elements(roster->'emails') e where jsonb_typeof(e)<>'string'
      or length(e#>>'{}')>254 or (e#>>'{}') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then return jsonb_build_object('error','roster'); end if;
    select jsonb_agg(email order by email) into emails from (select distinct lower(btrim(e)) email from jsonb_array_elements_text(roster->'emails') e) x;
    result := result || jsonb_build_object('roster', jsonb_build_object('emails', emails, 'imported_at', now()));
  end if;
  if p_patch ? 'campaign' then
    campaign := p_patch->'campaign';
    if jsonb_typeof(campaign)<>'object' or exists(select 1 from jsonb_each(campaign) e
      where e.key not in ('week_start','intro','recipe_title','recipe_url','bake_title','bake_url') or jsonb_typeof(e.value)<>'string') then return jsonb_build_object('error','campaign'); end if;
    if coalesce(campaign->>'week_start','') !~ '^2026-[0-9]{2}-[0-9]{2}$' then return jsonb_build_object('error','date'); end if;
    begin perform (campaign->>'week_start')::date; exception when others then return jsonb_build_object('error','date'); end;
    if length(coalesce(campaign->>'intro',''))>800
      or length(coalesce(campaign->>'recipe_title',''))>160 or length(coalesce(campaign->>'bake_title',''))>160
      or exists(select 1 from (values(campaign->>'recipe_url'),(campaign->>'bake_url')) u(url)
        where coalesce(url,'')<>'' and (length(url)>1000 or url !~ '^https://[^[:space:]]+$')) then return jsonb_build_object('error','campaign'); end if;
    result := result || jsonb_build_object('campaign',campaign);
  end if;
  update agc_entry_recovery.outreach_settings set value=result where id;
  return public.admin_outreach_get(p_key);
end $$;
revoke all on function public.admin_outreach_save(text,jsonb) from public;
grant execute on function public.admin_outreach_save(text,jsonb) to anon, authenticated;

-- Optional, first-touch source for a baker who already holds their private entry code.
create function public.record_entry_source(p_token uuid, p_source jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
  select id into eid from public.entrants where token=p_token and not disqualified;
  if eid is null then return jsonb_build_object('error','entrant'); end if;
  if jsonb_typeof(p_source) is distinct from 'object' or octet_length(p_source::text)>2000
    or exists(select 1 from jsonb_each(p_source) e where e.key not in ('heard_from','utm_source','utm_medium','utm_campaign')
      or jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>160)
    or coalesce(p_source->>'heard_from','') not in ('','Academy','Facebook','YouTube','Instagram','TikTok','Newsletter','Partner','Friend','Search','Other') then return jsonb_build_object('error','source'); end if;
  insert into agc_entry_recovery.entry_sources(entrant_id,source) values(eid,p_source) on conflict do nothing;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.record_entry_source(uuid,jsonb) from public;
grant execute on function public.record_entry_source(uuid,jsonb) to anon, authenticated;

create function agc_entry_recovery.progress_mail_list_v3()
returns table(entrant_id uuid,email text,first_name text,is_test boolean,lessons_done int,
 next_key text,next_title text,quiz_passed boolean,last_sent_at timestamptz,
 entries int,next_points int,open_bonus jsonb,membership_status text,next_score numeric,
 completed_lessons jsonb,campaign jsonb,grain_won boolean)
language sql stable security definer set search_path='' as $$
  select v.*, case
    when not (s.value ? 'roster') or (s.value->'roster'->>'imported_at')::timestamptz < now()-interval '14 days' then 'unknown'
    when (s.value->'roster'->'emails') ? lower(btrim(v.email)) then 'member' else 'unmatched' end,
    (select q.best_score from public.quiz_results q where q.entrant_id=v.entrant_id and q.task_key=v.next_key),
    coalesce((select jsonb_agg(jsonb_build_object('title',t.title,'score',q.best_score) order by t.sort,t.key)
      from public.claims c join public.tasks t on t.key=c.task_key
      left join public.quiz_results q on q.entrant_id=c.entrant_id and q.task_key=c.task_key
      where c.entrant_id=v.entrant_id and c.status='verified' and t.category='module' and t.active), '[]'::jsonb),
    coalesce(s.value->'campaign','{}'::jsonb),
    exists(select 1 from public.draws d left join public.winner_fulfillment f on f.draw_id=d.id
      where d.entrant_id=v.entrant_id and d.kind in ('weekly','final_small') and coalesce(f.status,'')<>'forfeited')
  from agc_entry_recovery.progress_mail_list_v2() v cross join agc_entry_recovery.outreach_settings s
  where s.id;
$$;
revoke all on function agc_entry_recovery.progress_mail_list_v3() from public, anon, authenticated;
