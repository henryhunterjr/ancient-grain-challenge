-- Preserve the actual draw time for fulfillment. Track the prize week separately.
alter table public.draws add column scheduled_friday date;
-- The four historical weeks used these labels (including the custom October 30 label).
update public.draws set scheduled_friday = case label
  when 'Week 1 · Oct 16' then date '2026-10-16'
  when 'Week 2 · Oct 23' then date '2026-10-23'
  when 'Week three October 30th' then date '2026-10-30'
  when 'Week 4 · Nov 6' then date '2026-11-06' end
where kind='weekly' and label in ('Week 1 · Oct 16','Week 2 · Oct 23','Week three October 30th','Week 4 · Nov 6');

create function public.admin_draw_friday(p_key text, p_friday date)
returns json language plpgsql security definer set search_path = '' as $$
declare
  first_day constant date := date '2026-10-16';
  cutoff timestamptz := (p_friday + 1)::timestamp at time zone 'America/New_York';
  picked record;
  week_label text;
begin
  if not public._is_admin(p_key) then return json_build_object('error','denied'); end if;
  if p_friday is null or p_friday not between first_day and date '2026-11-27'
     or (p_friday-first_day)%7 <> 0 or p_friday > (now() at time zone 'America/New_York')::date then
    return json_build_object('error','date');
  end if;
  week_label := format('Week %s · %s',1+(p_friday-first_day)/7,to_char(p_friday,'Mon FMDD'));
  perform pg_advisory_xact_lock(hashtextextended('ancient-grain-challenge-draw',0));
  if (select count(*) from public.draws where kind='weekly') >= 28
     or (select count(*) from public.draws where kind='weekly' and
        (scheduled_friday=p_friday or (scheduled_friday is null and label=week_label))) >= 4 then
    return json_build_object('error','prize_limit');
  end if;
  with pool as materialized (
    select e.id, greatest(sum(t.points),1)::integer as weight
    from public.entrants e join public.claims c on c.entrant_id=e.id
    join public.tasks t on t.key=c.task_key and t.active
    where not e.is_test and not e.disqualified and e.created_at < cutoff
      and c.status='verified' and c.claimed_at < cutoff and coalesce(c.reviewed_at,c.claimed_at) < cutoff
      and (t.category <> 'module' or public._lesson_percentage(c.proof)>=70)
      and not exists (select 1 from public.draws d where d.entrant_id=e.id and d.kind in ('weekly','final_small'))
    group by e.id having bool_or(t.category='module')
  )
  select id,weight,(select count(*) from pool) as pool_size into picked from pool
    order by -ln(1-random())/weight limit 1;
  if not found then return json_build_object('error','empty'); end if;
  insert into public.draws(prize,entrant_id,entries,pool_size,kind,label,scheduled_friday)
    values('5 lb bag',picked.id,picked.weight,picked.pool_size,'weekly',week_label,p_friday);
  return (select json_build_object('name',full_name,'entries',picked.weight,'pool_size',picked.pool_size)
    from public.entrants where id=picked.id);
end $$;
revoke all on function public.admin_draw_friday(text,date) from public;
grant execute on function public.admin_draw_friday(text,date) to anon,authenticated;
