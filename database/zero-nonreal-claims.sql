-- Authorized October 7, 2026: preserve and zero the eleven existing non-real
-- lesson claims. Apply AFTER launch-validation.sql. No entrant/token deletion.
begin;
lock table public.claims in share row exclusive mode;
do $$
begin
  if (select count(*) from public.claims c join public.tasks t on t.key=c.task_key
      where t.category='module' and t.active and c.status='verified'
        and coalesce(public._lesson_percentage(c.proof),0)<70)<>11 then
    raise exception 'Expected exactly eleven authorized non-real claims. Reinspect before cleanup.';
  end if;
end $$;
create schema if not exists agc_archive;
revoke all on schema agc_archive from public,anon,authenticated;
create table agc_archive.launch_claim_originals (
  release_name text not null,
  claim_id uuid not null,
  original jsonb not null,
  archived_at timestamptz not null default now(),
  primary key(release_name,claim_id)
);
alter table agc_archive.launch_claim_originals enable row level security;
revoke all on agc_archive.launch_claim_originals from public,anon,authenticated;
insert into agc_archive.launch_claim_originals(release_name,claim_id,original)
select '2026-10-07-challenge-launch',c.id,to_jsonb(c)
from public.claims c join public.tasks t on t.key=c.task_key
where t.category='module' and t.active and c.status='verified'
  and coalesce(public._lesson_percentage(c.proof),0)<70;
update public.claims c set status='rejected',reviewed_at=now()
from agc_archive.launch_claim_originals a
where a.release_name='2026-10-07-challenge-launch' and a.claim_id=c.id;
do $$
begin
  if (select count(*) from agc_archive.launch_claim_originals where release_name='2026-10-07-challenge-launch')<>11 then
    raise exception 'Cleanup archive count mismatch';
  end if;
end $$;
commit;
