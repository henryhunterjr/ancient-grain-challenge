-- Personal "your next lesson" emails.
-- Each email carries a sign-in link that lands the baker on their next lesson.
-- These links can be tapped again for 7 days (phone, then laptop), unlike the
-- one-time 60-minute links from the "Email me a sign-in link" form.

alter table agc_entry_recovery.links add column if not exists reusable boolean not null default false;

create table if not exists agc_entry_recovery.progress_mail_log (
  id bigint generated always as identity primary key,
  entrant_id uuid not null references public.entrants(id) on delete cascade,
  lesson_key text,
  kind text not null default 'next_lesson',
  sent_at timestamptz not null default clock_timestamp()
);
create index if not exists progress_mail_log_entrant on agc_entry_recovery.progress_mail_log(entrant_id, sent_at desc);
alter table agc_entry_recovery.progress_mail_log enable row level security;
revoke all on agc_entry_recovery.progress_mail_log from public, anon, authenticated;

-- Redeem: one-time links work once; reusable links work until they expire.
create or replace function agc_entry_recovery.entry_recovery_redeem(p_token_hash text, p_ip_hash text)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare match_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('agc_entry_recovery_redeem',0));
  if not agc_entry_recovery.take_limit('redeem-global',3600,300)
    or not agc_entry_recovery.take_limit('redeem-ip:'||p_ip_hash,900,30) then return null; end if;
  update agc_entry_recovery.links set used_at=coalesce(used_at,clock_timestamp())
    where token_hash=p_token_hash and expires_at>clock_timestamp() and (used_at is null or reusable)
    returning entrant_id into match_id;
  if match_id is null then return null; end if;
  return (select jsonb_build_object('token',token,'first_name',split_part(full_name,' ',1)) from public.entrants where id=match_id);
end $function$;

-- Who gets a "next lesson" email: real, active entrants with at least one lesson left.
-- quiz_passed means they already passed the next lesson's quiz but the lesson is not
-- credited yet (almost always the missing YouTube comment name).
create or replace function agc_entry_recovery.progress_mail_list()
 returns table(entrant_id uuid, email text, first_name text, is_test boolean, lessons_done int,
               next_key text, next_title text, quiz_passed boolean, last_sent_at timestamptz)
 language sql stable security definer set search_path to ''
as $function$
  with mods as (select key, title, sort from public.tasks where category='module' and active),
  e as (select * from public.entrants where not coalesce(disqualified,false) or coalesce(is_test,false)),
  done as (select c.entrant_id, count(distinct c.task_key)::int n from public.claims c join mods m on m.key=c.task_key
           where c.status='verified' group by 1),
  nxt as (select e.id, (select m.key from mods m where not exists (select 1 from public.claims c
            where c.entrant_id=e.id and c.task_key=m.key and c.status='verified') order by m.sort, m.key limit 1) k from e)
  select e.id, lower(btrim(e.email::text)), initcap(split_part(btrim(e.full_name),' ',1)), coalesce(e.is_test,false),
         coalesce(d.n,0), n.k, (select title from mods where key=n.k),
         exists (select 1 from public.quiz_results q where q.entrant_id=e.id and q.task_key=n.k and q.best_score>=70),
         (select max(sent_at) from agc_entry_recovery.progress_mail_log l where l.entrant_id=e.id)
  from e left join done d on d.entrant_id=e.id join nxt n on n.id=e.id
  where n.k is not null
$function$;

create or replace function agc_entry_recovery.progress_link_issue(p_entrant uuid, p_token_hash text, p_days int default 7)
 returns void language sql security definer set search_path to ''
as $function$
  insert into agc_entry_recovery.links(token_hash, entrant_id, expires_at, reusable)
  values (p_token_hash, p_entrant, clock_timestamp() + make_interval(days => least(greatest(p_days,1),14)), true);
$function$;

create or replace function agc_entry_recovery.progress_mail_logged(p_entrant uuid, p_lesson text)
 returns void language sql security definer set search_path to ''
as $function$
  insert into agc_entry_recovery.progress_mail_log(entrant_id, lesson_key) values (p_entrant, p_lesson);
$function$;

revoke all on function agc_entry_recovery.progress_mail_list() from public, anon, authenticated;
revoke all on function agc_entry_recovery.progress_link_issue(uuid,text,int) from public, anon, authenticated;
revoke all on function agc_entry_recovery.progress_mail_logged(uuid,text) from public, anon, authenticated;
