-- LOCAL DISPOSABLE DATABASE ONLY. Contains eleven synthetic missing-score claims.
insert into tasks(key,title,category,points) select 'm'||n,'Lesson '||n,'module',20 from generate_series(1,7) n on conflict(key) do nothing;
insert into entrants(email,full_name,skool_name,country,rules_accepted)
values ('archive-one@example.invalid','Synthetic One','Synthetic fixture','United States',true),
 ('archive-two@example.invalid','Synthetic Two','Synthetic fixture','United States',true);
insert into claims(entrant_id,task_key,proof,status)
select e.id,'m'||n,'YouTube: Synthetic without score','verified' from entrants e cross join generate_series(1,7) n
where e.email='archive-one@example.invalid' or (e.email='archive-two@example.invalid' and n<=4);
\ir ../database/zero-nonreal-claims.sql
do $$
begin
  if (select count(*) from claims where status='rejected')<>11 then raise exception 'Cleanup did not zero eleven claims'; end if;
  if (select count(*) from agc_archive.launch_claim_originals)<>11 then raise exception 'Original archive incomplete'; end if;
  if exists(select 1 from _scores where verified_points<>0 or pending_points<>0) then raise exception 'Zeroed claims still contribute points'; end if;
  if has_schema_privilege('anon','agc_archive','usage') or has_table_privilege('anon','agc_archive.launch_claim_originals','select') then raise exception 'Archive exposed'; end if;
end $$;
\ir ../database/restore-nonreal-claims.sql
do $$
begin
  if (select count(*) from claims where status='verified')<>11 then raise exception 'Original status not restored'; end if;
  if exists(select 1 from _scores where verified_points<>0) then raise exception 'Restore bypassed score rule'; end if;
end $$;
select 'PASS: eleven originals privately archived, zero credit, guarded restoration and no public archive access' as result;
