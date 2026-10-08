-- REVIEW ONLY: restores the eleven archived status/review values if the baker's
-- proof/claimed timestamp has not since changed. Never overwrite later work.
-- The archive stays intact. Under passing-score validation, invalid restored
-- claims still contribute zero verified points until corrected.
begin;
lock table public.claims in share row exclusive mode;
do $$
begin
  if (select count(*) from agc_archive.launch_claim_originals where release_name='2026-10-07-challenge-launch')<>11 then
    raise exception 'Expected eleven preserved originals';
  end if;
  if exists(select 1 from agc_archive.launch_claim_originals a left join public.claims c on c.id=a.claim_id
    where a.release_name='2026-10-07-challenge-launch'
      and (c.id is null or c.status<>'rejected' or c.proof is distinct from a.original->>'proof'
        or c.claimed_at is distinct from (a.original->>'claimed_at')::timestamptz)) then
    raise exception 'A claim changed after cleanup. Review instead of overwriting.';
  end if;
end $$;
update public.claims c set status=a.original->>'status',reviewed_at=(a.original->>'reviewed_at')::timestamptz
from agc_archive.launch_claim_originals a
where a.release_name='2026-10-07-challenge-launch' and a.claim_id=c.id;
commit;
