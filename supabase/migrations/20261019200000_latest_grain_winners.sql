-- Latest grain drawing's winners for the next-lesson emails: first name + last initial and grain only.
create or replace function agc_entry_recovery.latest_grain_winners()
 returns table(public_name text, grain text, drawn_on date)
 language sql stable security definer set search_path to ''
as $function$
  with g as (
    select d.*, (d.drawn_at at time zone 'America/New_York')::date as day
    from public.draws d left join public.winner_fulfillment f on f.draw_id = d.id
    where d.kind <> 'mixer' and coalesce(f.status, '') <> 'forfeited'
  )
  select initcap(split_part(btrim(e.full_name),' ',1))
           || coalesce(' ' || upper(left(nullif(split_part(btrim(e.full_name),' ',2),''),1)) || '.', ''),
         coalesce(f.grain, e.preferred_grain), g.day
  from g join public.entrants e on e.id = g.entrant_id left join public.winner_fulfillment f on f.draw_id = g.id
  where g.day = (select max(day) from g)
  order by g.drawn_at
$function$;
revoke all on function agc_entry_recovery.latest_grain_winners() from public, anon, authenticated;
