"""Atomic release/replay/failure verification with synthetic localhost snapshots."""
import os,pathlib,re,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
BIN=pathlib.Path(os.environ.get('PG_BIN',r'C:\Program Files\PostgreSQL\17\bin'))
PORT=os.environ.get('AGC_TEST_PG_PORT','55439')
ENV={**os.environ,'PGCLIENTENCODING':'UTF8'}
DB='agc_bundle_test_'+str(int(time.time()))
def read(p):return (ROOT/p).read_text(encoding='utf-8')
def sql(query,fail=False):
 r=subprocess.run([str(BIN/'psql.exe'),'-h','127.0.0.1','-p',PORT,'-U','postgres','-w','-d',DB,'-At','-v','ON_ERROR_STOP=1'],input=query,text=True,encoding='utf-8',capture_output=True,cwd=ROOT,env=ENV)
 if bool(r.returncode)!=fail:raise RuntimeError(r.stderr or 'Expected guarded failure')
 return r.stderr if fail else r.stdout.strip()
subprocess.run([str(BIN/'createdb.exe'),'-h','127.0.0.1','-p',PORT,'-U','postgres','-w',DB],check=True,env=ENV)
sql(read('tests/baseline-schema.sql').replace('\\ir baseline-functions.sql',read('tests/baseline-functions.sql')))
sql("""
insert into tasks(key,title,category,points,sort) select 'm'||n,'Synthetic lesson '||n,'module',20,n from generate_series(1,7)n on conflict(key)do nothing;
insert into entrants(id,email,full_name,skool_name,country,rules_accepted,newsletter) values
 ('c7b0c745-3e3d-4b5a-ba23-2100b6b4757b','bundle-one@example.invalid','Test Entrant','Synthetic','US',true,false),
 ('1512d56d-496b-4575-b501-c61724c8c64f','bundle-two@example.invalid','TEST dot Launch Audit','Synthetic','US',true,false);
insert into entrants(email,full_name,skool_name,country,rules_accepted,newsletter)
select 'bundle-other-'||n||'@example.invalid','Synthetic other '||n,'Synthetic','US',true,false from generate_series(1,3)n;
insert into claims(entrant_id,task_key,proof,status)
select e.id,'m'||n,case when e.email='bundle-one@example.invalid' and n=1 then 'YouTube: Synthetic · Score: 8 of 10' else 'YouTube: Synthetic missing score' end,'verified'
from entrants e cross join generate_series(1,7)n where (e.email='bundle-one@example.invalid' and n<=5) or e.email='bundle-other-1@example.invalid';
insert into claims(entrant_id,task_key,proof,status)
select e.id,t.key,'Synthetic bonus','pending' from entrants e cross join tasks t where e.email in ('bundle-one@example.invalid','bundle-other-1@example.invalid') and t.category='bonus';
""")
bundle=read('test-output/approved-release-bundle.sql')
# Substitute only the expected snapshot values for this different synthetic fixture.
# Keep the production bundle and every guard's logic intact on disk.
for signature,expected in re.findall(r"\('([^']+)',\s*'([a-f0-9]{32})'\)",read('database/launch-validation.sql')):
 actual=sql(f"select md5(pg_get_functiondef('public.{signature}'::regprocedure));")
 bundle=bundle.replace(expected,actual)
bundle=bundle.replace('3372453de1d3fb88e40db269951bf702',sql("select md5(pg_get_viewdef('public._scores'::regclass,true));"))
bundle=bundle.replace('9eb391a4b8f98271eac6c7736eafadd8',sql("select md5(pg_get_functiondef('public.recover(text,text)'::regprocedure));"))
bundle=bundle.replace('ad29620f1cd2fbb875970a7fe62a7a90',sql("select md5(jsonb_agg(to_jsonb(c) order by c.id)::text) from claims c;"))
assert 'division by zero' in sql(bundle.replace('commit;','select 1/0;\ncommit;'),fail=True)
assert sql("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='entrants' and column_name='is_test');")=='f'
assert sql("select to_regclass('agc_archive.launch_claim_originals') is null and to_regclass('public.quiz_results') is null;")=='t'
print('PASS: injected final-step failure rolls back all five release steps')
sql(bundle)
sql("""do $$ begin
 if (select count(*) from agc_archive.launch_claim_originals)<>11 or (select count(*) from entrants where is_test)<>2
  or has_function_privilege('anon','public.recover(text,text)','execute') or to_regclass('public.quiz_results')is null
  or (select count(*) from claims where status='rejected')<>11 or (select count(*) from draws)<>0 then raise exception 'Combined release outcome'; end if;
end $$;""")
assert 'Release has changed or already applied' in sql(bundle,fail=True)
assert sql('select count(*) from agc_archive.launch_claim_originals;')=='11'
print(f'PASS: full atomic release applies once, eleven originals/two flags preserved, replay rejected; {DB}')
