-- LOCAL DISPOSABLE DATABASE ONLY. Synthetic rows mirror the two proposal IDs.
insert into entrants(id,email,full_name,skool_name,country,rules_accepted) values
 ('c7b0c745-3e3d-4b5a-ba23-2100b6b4757b','proposal-one@example.invalid','Test Entrant','Synthetic fixture','United States',true),
 ('1512d56d-496b-4575-b501-c61724c8c64f','proposal-two@example.invalid','TEST dot Launch Audit','Synthetic fixture','United States',true);
\ir ../database/confirmed-test-flags-proposal.sql
do $$
begin
  if (select count(*) from entrants where is_test)<>2 then raise exception 'Proposal did not flag exactly two'; end if;
  if (select count(*) from entrants where disqualified)<>0 then raise exception 'Proposal altered disqualification'; end if;
end $$;
\ir ../database/undo-confirmed-test-flags.sql
do $$
begin
  if (select count(*) from entrants where is_test)<>0 then raise exception 'Flag rollback failed'; end if;
  if (select count(*) from entrants)<>2 then raise exception 'Flag proposal removed records'; end if;
end $$;
delete from entrants where email in ('proposal-one@example.invalid','proposal-two@example.invalid');
select 'PASS: exact two-row test flag proposal and targeted undo; no deletion by proposal, no disqualification change' as result;
