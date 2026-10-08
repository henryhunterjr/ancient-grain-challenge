"""Prepare one atomic, snapshot-guarded release bundle. Does not connect or apply.

Reinspect task coordination and live state before applying. The checksum below
is the read-only sixteen-claim snapshot from October 8, 2026. A changed snapshot
or already-applied release rejects the whole bundle without overwriting data.
"""
import pathlib,re
ROOT=pathlib.Path(__file__).resolve().parents[1]
files=['database/launch-validation.sql','database/zero-nonreal-claims.sql',
       'database/confirmed-test-flags-proposal.sql','database/entry-code-recovery-proposal.sql',
       'supabase/migrations/20261008020550_muse_quiz_handoff.sql']
header="""-- GENERATED REVIEW BUNDLE. Not applied. Do not race another release task.
-- Reinspect the live outcome if a previous tool call was interrupted.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
select pg_advisory_xact_lock(hashtextextended('ancient-grain-challenge-release',0));
select pg_advisory_xact_lock(hashtextextended('ancient-grain-challenge-draw',0));
lock table public.entrants,public.claims,public.tasks,public.settings,public.draws in share row exclusive mode;
do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='entrants' and column_name='is_test')
  or to_regclass('agc_archive.launch_claim_originals') is not null or to_regclass('public.quiz_results') is not null then
  raise exception 'Release has changed or already applied; inspect outcome before any retry';
 end if;
 if (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'[]')) from public.claims c)<>'ad29620f1cd2fbb875970a7fe62a7a90'
  or (select count(*) from public.claims)<>16 then raise exception 'Inspected claim snapshot changed'; end if;
end $$;
"""
parts=[header]
for file in files:
    sql=(ROOT/file).read_text(encoding='utf-8')
    # Remove only top-level transaction lines; retain every original guard.
    sql=re.sub(r'^(begin|commit);\s*$', '',sql,flags=re.M|re.I)
    parts.append('-- Source: '+file+'\n'+sql)
parts.append('commit;\n')
out=ROOT/'test-output/approved-release-bundle.sql';out.parent.mkdir(exist_ok=True)
out.write_text('\n'.join(parts),encoding='utf-8')
print(f'Prepared {out}; all five steps guarded and atomic, with bounded locks. NOT APPLIED.')
