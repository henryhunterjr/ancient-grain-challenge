-- READ ONLY. Recompute proposed scoring without creating functions or modifying rows.
-- UUIDs identify ONLY the two confirmed tests proposed for separate approval.
with parsed as (
  select c.*,t.category,t.active,t.points,
    case when length(c.proof)<=500 then regexp_match(trim(c.proof),'^YouTube: ([^\r\n]{1,120}) '||chr(183)||' Score: (.+)$') end as parts
  from public.claims c join public.tasks t on t.key=c.task_key
), fractions as (
  select *,regexp_match(parts[2],'^([0-9]+([.][0-9]+)?|[.][0-9]+) (of|out of) ([0-9]+([.][0-9]+)?|[.][0-9]+)$') as fraction
  from parsed
), scored as (
  select *,case when trim(parts[1])<>'' and position(' '||chr(183)||' Score: ' in parts[1])=0 then
    case when parts[2] ~ '^([0-9]+([.][0-9]+)?|[.][0-9]+)%?$' then rtrim(parts[2],'%')::numeric
         when fraction is not null and fraction[4]::numeric>0 then 100*fraction[1]::numeric/fraction[4]::numeric end end as percentage
  from fractions
), proposed as (
  select e.id,e.disqualified,
    e.id in ('c7b0c745-3e3d-4b5a-ba23-2100b6b4757b','1512d56d-496b-4575-b501-c61724c8c64f') as confirmed_test,
    old.modules_total,old.modules_verified as old_modules,old.verified_points as old_points,
    count(*) filter(where c.active and c.status='verified' and c.category='module' and c.percentage between 70 and 100)::integer as new_modules,
    coalesce(sum(c.points) filter(where c.active and c.status='verified' and (c.category<>'module' or c.percentage between 70 and 100)),0)::integer as new_points
  from public.entrants e join public._scores old on old.entrant_id=e.id
  left join scored c on c.entrant_id=e.id group by e.id,e.disqualified,old.modules_total,old.modules_verified,old.verified_points
)
select count(*) as all_records,
  count(*) filter(where not disqualified) as active_before,
  count(*) filter(where not disqualified and not confirmed_test) as active_if_tests_flagged,
  count(*) filter(where not disqualified and old_modules>=1) as weekly_before,
  count(*) filter(where not disqualified and new_modules>=1) as weekly_after_scores,
  count(*) filter(where not disqualified and not confirmed_test and new_modules>=1) as weekly_after_scores_and_flags,
  count(*) filter(where not disqualified and modules_total=7 and old_modules=7) as final_before,
  count(*) filter(where not disqualified and modules_total=7 and new_modules=7) as final_after_scores,
  count(*) filter(where not disqualified and old_modules>=1 and new_modules<1) as entrants_losing_weekly_eligibility,
  count(*) filter(where not disqualified and modules_total=7 and old_modules=7 and new_modules<7) as entrants_losing_final_eligibility,
  count(*) filter(where not disqualified and old_points<>new_points) as entrants_with_changed_points,
  sum(old_points) filter(where not disqualified) as active_points_before,
  sum(new_points) filter(where not disqualified) as active_points_after,
  sum(new_points) filter(where not disqualified and not confirmed_test) as active_points_after_scores_and_flags,
  (select count(*) from scored where active and category='module' and status='verified') as verified_module_claims_before,
  (select count(*) from scored where active and category='module' and status='verified' and percentage between 70 and 100) as valid_module_claims_preserved,
  (select count(*) from public.draws) as existing_draws
from proposed;
