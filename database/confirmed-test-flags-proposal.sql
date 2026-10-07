-- REVIEW ONLY: separate approval required for THESE TWO actual data flags.
-- Do not run as part of launch-validation.sql. No name heuristics or deletion.
-- After is_test is added, verify the exact two identity rows then update only those IDs.
begin;
do $$
begin
  perform 1 from public.entrants where id in ('c7b0c745-3e3d-4b5a-ba23-2100b6b4757b','1512d56d-496b-4575-b501-c61724c8c64f') for update;
  if (select count(*) from public.entrants where
    (id='c7b0c745-3e3d-4b5a-ba23-2100b6b4757b' and full_name='Test Entrant' and not is_test)
    or (id='1512d56d-496b-4575-b501-c61724c8c64f' and full_name='TEST dot Launch Audit' and not is_test))<>2 then
    raise exception 'Confirmed test identities/flags changed. Reinspect and obtain approval.';
  end if;
end $$;
update public.entrants set is_test=true where id in (
  'c7b0c745-3e3d-4b5a-ba23-2100b6b4757b','1512d56d-496b-4575-b501-c61724c8c64f');
commit;
