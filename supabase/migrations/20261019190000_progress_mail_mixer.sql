-- Next-lesson emails now also go to bakers who finished all seven lessons, and every
-- email shows the baker's mixer entries (1 for registering + 1 per verified point),
-- what the next lesson adds, and which bonus activities are still open.
drop function if exists agc_entry_recovery.progress_mail_list();
create function agc_entry_recovery.progress_mail_list()
 returns table(entrant_id uuid, email text, first_name text, is_test boolean, lessons_done int,
               next_key text, next_title text, quiz_passed boolean, last_sent_at timestamptz,
               entries int, next_points int, open_bonus jsonb)
 language sql stable security definer set search_path to ''
as $function$
  with mods as (select key, title, sort from public.tasks where category='module' and active),
  e as (select * from public.entrants where not coalesce(disqualified,false) or coalesce(is_test,false)),
  done as (select c.entrant_id, count(distinct c.task_key)::int n from public.claims c join mods m on m.key=c.task_key
           where c.status='verified' group by 1),
  pts as (select c.entrant_id, coalesce(sum(t.points),0)::int p from public.claims c join public.tasks t on t.key=c.task_key
          where c.status='verified' group by 1),
  nxt as (select e.id, (select m.key from mods m where not exists (select 1 from public.claims c
            where c.entrant_id=e.id and c.task_key=m.key and c.status='verified') order by m.sort, m.key limit 1) k from e)
  select e.id, lower(btrim(e.email::text)), initcap(split_part(btrim(e.full_name),' ',1)), coalesce(e.is_test,false),
         coalesce(d.n,0), n.k, (select title from mods where key=n.k),
         n.k is not null and exists (select 1 from public.quiz_results q where q.entrant_id=e.id and q.task_key=n.k and q.best_score>=70),
         (select max(sent_at) from agc_entry_recovery.progress_mail_log l where l.entrant_id=e.id),
         1 + coalesce(p.p,0),
         (select points from public.tasks where key=n.k),
         coalesce((select jsonb_agg(jsonb_build_object('title',t.title,'points',t.points) order by t.sort)
                   from public.tasks t where t.category<>'module' and t.active
                     and not exists (select 1 from public.claims c where c.entrant_id=e.id and c.task_key=t.key
                                     and c.status in ('verified','pending'))), '[]'::jsonb)
  from e left join done d on d.entrant_id=e.id left join pts p on p.entrant_id=e.id join nxt n on n.id=e.id
$function$;
revoke all on function agc_entry_recovery.progress_mail_list() from public, anon, authenticated;
