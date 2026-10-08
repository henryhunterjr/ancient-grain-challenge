-- REVIEW ONLY: reverse just the separately approved two flags; retain all records.
-- No other flags are touched. Existing disqualification is preserved.
begin;
do $$
begin
  perform 1 from public.entrants where id in ('c7b0c745-3e3d-4b5a-ba23-2100b6b4757b','1512d56d-496b-4575-b501-c61724c8c64f') for update;
  if (select count(*) from public.entrants where
    (id='c7b0c745-3e3d-4b5a-ba23-2100b6b4757b' and full_name='Test Entrant' and is_test)
    or (id='1512d56d-496b-4575-b501-c61724c8c64f' and full_name='TEST dot Launch Audit' and is_test))<>2 then
    raise exception 'Confirmed test identities/flags changed. Reinspect before undo.';
  end if;
end $$;
update public.entrants set is_test=false where id in (
  'c7b0c745-3e3d-4b5a-ba23-2100b6b4757b','1512d56d-496b-4575-b501-c61724c8c64f');
commit;
