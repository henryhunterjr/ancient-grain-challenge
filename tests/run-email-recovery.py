"""Local PostgreSQL security, single-use/concurrency and rollback tests only."""
import concurrent.futures,os,pathlib,subprocess,time
root=pathlib.Path(__file__).resolve().parents[1]
bin=pathlib.Path(os.environ.get('PG_BIN',r'C:\Program Files\PostgreSQL\17\bin'))
port=os.environ.get('AGC_TEST_PG_PORT','55439');db='agc_email_test_'+str(int(time.time()))
env={**os.environ,'PGCLIENTENCODING':'UTF8'}
args=['-h','127.0.0.1','-p',port,'-U','postgres','-w','-d',db,'-v','ON_ERROR_STOP=1','-At']
subprocess.run([str(bin/'createdb.exe'),'-h','127.0.0.1','-p',port,'-U','postgres','-w',db],check=True,env=env)
def sql(source,ok=True):
    r=subprocess.run([str(bin/'psql.exe'),*args],input=source,text=True,encoding='utf-8',capture_output=True,env=env)
    if ok and r.returncode: raise RuntimeError(r.stderr)
    if not ok and not r.returncode: raise AssertionError('Expected denied access')
    return r.stdout.strip()
baseline=(root/'tests/baseline-schema.sql').read_text(encoding='utf-8').replace('\\ir baseline-functions.sql',(root/'tests/baseline-functions.sql').read_text(encoding='utf-8'))
sql(baseline)
sql("do $$ begin if not exists(select 1 from pg_roles where rolname='authenticator')then create role authenticator nologin;end if;end $$;")
sql("insert into entrants(email,full_name,skool_name,country,newsletter,rules_accepted)values('synthetic-recovery@example.invalid','Synthetic Baker','Other','United States',false,true);")
sql("insert into claims(entrant_id,task_key,proof,status)select id,'m7','Synthetic existing proof','verified' from entrants;")
snapshot=sql("select md5(jsonb_agg(to_jsonb(e))::text) from entrants e;")+sql("select md5(jsonb_agg(to_jsonb(c))::text) from claims c;")
migration=(root/'supabase/migrations/20261008211000_email_entry_recovery.sql').read_text(encoding='utf-8')
sql("insert into entrants(email,full_name,skool_name,country,newsletter,rules_accepted)values(' synthetic-recovery@example.invalid ','Synthetic Duplicate','Other','United States',false,true);")
sql(migration,ok=False)
assert sql("select to_regnamespace('agc_entry_recovery') is null;")=='t','Duplicate preflight created recovery objects'
sql("delete from entrants where email=' synthetic-recovery@example.invalid ';")
sql(migration);sql((root/'tests/email-recovery.sql').read_text(encoding='utf-8'))
sql("set role anon;select entry_recovery_issue('synthetic-recovery@example.invalid',repeat('a',64),repeat('b',64),repeat('c',64));",ok=False)
sql("set role agc_entry_recovery_worker;select token from entrants;",ok=False)
sql("delete from agc_entry_recovery.limits;insert into agc_entry_recovery.links(token_hash,entrant_id)select repeat('3',64),id from entrants;")
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    results=list(pool.map(lambda i:sql("set role agc_entry_recovery_worker;select entry_recovery_redeem(repeat('3',64),repeat('4',64)) is not null;"),range(10)))
assert sum(r.endswith('t') for r in results)==1,'Concurrent credential redeemed more than once'
sql("delete from agc_entry_recovery.limits;")
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    issued=list(pool.map(lambda i:sql("set role agc_entry_recovery_worker;select entry_recovery_issue('synthetic-recovery@example.invalid',md5('concurrent'||"+str(i)+"::text)||md5('concurrent'||"+str(i)+"::text),repeat('8',64),repeat('9',64)) ? 'recipient';"),range(10)))
assert sum(r.endswith('t') for r in issued)==1,'Concurrent requests bypassed cooldown'
assert snapshot==sql("select md5(jsonb_agg(to_jsonb(e))::text) from entrants e;")+sql("select md5(jsonb_agg(to_jsonb(c))::text) from claims c;")
sql((root/'database/rollback-email-entry-recovery.sql').read_text(encoding='utf-8'))
assert sql("select to_regprocedure('public.entry_recovery_redeem(text,text)') is null;")=='t'
assert snapshot==sql("select md5(jsonb_agg(to_jsonb(e))::text) from entrants e;")+sql("select md5(jsonb_agg(to_jsonb(c))::text) from claims c;")
print('PASS: isolated worker, duplicate preflight/runtime rejection, limits, expiry/reuse/revocation, ten concurrent requests and ten concurrent redeems each yield one success; original code/claims unchanged; rollback removes access. Local database: '+db)
