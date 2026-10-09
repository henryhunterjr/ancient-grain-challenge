"""Local PostgreSQL security, single-use/concurrency and rollback tests only."""
import concurrent.futures,os,pathlib,secrets,subprocess,time
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
# Model the read-only production ACL snapshot: only these three functions
# grant PUBLIC execution, and every existing API role has explicit grants.
sql("revoke execute on all functions in schema public from public;grant execute on all functions in schema public to anon,authenticated,service_role;")
public_functions="public.register(text,text,text,text,text,text,text,boolean,boolean,text),public.winners(),public.admin_draw(text,text,text,text)"
sql("grant execute on function "+public_functions+" to public;")
sql("do $$ begin if not exists(select 1 from pg_roles where rolname='authenticator')then create role authenticator nologin;end if;end $$;")
sql("insert into entrants(email,full_name,skool_name,country,newsletter,rules_accepted)values('synthetic-recovery@example.invalid','Synthetic Baker','Other','United States',false,true);")
sql("insert into claims(entrant_id,task_key,proof,status)select id,'m7','Synthetic existing proof','verified' from entrants;")
snapshot=sql("select md5(jsonb_agg(to_jsonb(e))::text) from entrants e;")+sql("select md5(jsonb_agg(to_jsonb(c))::text) from claims c;")
acl_query="select md5(jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,a.grantee,a.privilege_type,a.is_grantable)order by p.oid::regprocedure::text,a.grantee,a.privilege_type)::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='public';"
original_acl=sql(acl_query)
migration=(root/'supabase/migrations/20261008211000_email_entry_recovery.sql').read_text(encoding='utf-8')
sql("insert into entrants(email,full_name,skool_name,country,newsletter,rules_accepted)values(' synthetic-recovery@example.invalid ','Synthetic Duplicate','Other','United States',false,true);")
sql(migration,ok=False)
assert sql("select to_regnamespace('agc_entry_recovery') is null;")=='t','Duplicate preflight created recovery objects'
sql("delete from entrants where email=' synthetic-recovery@example.invalid ';")
sql("create function public.unexpected_fixture_function() returns void language sql as 'select';")
sql(migration,ok=False)
assert sql("select to_regnamespace('agc_entry_recovery') is null;")=='t','ACL drift preflight created recovery objects'
sql("drop function public.unexpected_fixture_function();")
sql("revoke execute on function public.winners() from authenticated;")
sql(migration,ok=False)
assert sql("select to_regnamespace('agc_entry_recovery') is null;")=='t','Missing API grant preflight created objects'
sql("grant execute on function public.winners() to authenticated;")
sql(migration);sql((root/'tests/email-recovery.sql').read_text(encoding='utf-8'))
sql("set role anon;select agc_entry_recovery.entry_recovery_issue('synthetic-recovery@example.invalid',repeat('a',64),repeat('b',64),repeat('c',64));",ok=False)
sql("set role agc_entry_recovery_worker;select token from entrants;",ok=False)
sql("delete from agc_entry_recovery.limits;insert into agc_entry_recovery.links(token_hash,entrant_id)select repeat('3',64),id from entrants;")
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    results=list(pool.map(lambda i:sql("set role agc_entry_recovery_worker;select agc_entry_recovery.entry_recovery_redeem(repeat('3',64),repeat('4',64)) is not null;"),range(10)))
assert sum(r.endswith('t') for r in results)==1,'Concurrent credential redeemed more than once'
sql("delete from agc_entry_recovery.limits;")
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    issued=list(pool.map(lambda i:sql("set role agc_entry_recovery_worker;select agc_entry_recovery.entry_recovery_issue('synthetic-recovery@example.invalid',md5('concurrent'||"+str(i)+"::text)||md5('concurrent'||"+str(i)+"::text),repeat('8',64),repeat('9',64)) ? 'recipient';"),range(10)))
assert sum(r.endswith('t') for r in issued)==1,'Concurrent requests bypassed cooldown'
synthetic_password=secrets.token_urlsafe(40)
sql("alter role agc_entry_recovery_worker login password '"+synthetic_password+"' valid until '2099-01-01';")
node=os.environ.get('AGC_TEST_NODE',r'C:\Program Files\nodejs\node.exe')
subprocess.run([node,str(root/'tests/database-live-local.test.cjs')],check=True,env={**env,'AGC_TEST_DB_NAME':db,'AGC_TEST_DB_PASSWORD':synthetic_password,'AGC_TEST_PG_PORT':port,'AGC_TEST_CA':str(root/'test-output/pg-email-data/server.crt')})
assert snapshot==sql("select md5(jsonb_agg(to_jsonb(e))::text) from entrants e;")+sql("select md5(jsonb_agg(to_jsonb(c))::text) from claims c;")
sql((root/'database/rollback-email-entry-recovery.sql').read_text(encoding='utf-8'))
assert sql("select to_regprocedure('agc_entry_recovery.entry_recovery_redeem(text,text)') is null;")=='t'
assert sql("select not exists(select 1 from pg_roles where rolname='agc_entry_recovery_worker');")=='t'
assert sql("select count(*) from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid=any(array['public.register(text,text,text,text,text,text,text,boolean,boolean,text)'::regprocedure::oid,'public.winners()'::regprocedure::oid,'public.admin_draw(text,text,text,text)'::regprocedure::oid]) and a.grantee=0 and a.privilege_type='EXECUTE';")=='3'
assert snapshot==sql("select md5(jsonb_agg(to_jsonb(e))::text) from entrants e;")+sql("select md5(jsonb_agg(to_jsonb(c))::text) from claims c;")
assert original_acl==sql(acl_query),'Rollback did not restore original application privilege semantics'
print('PASS: isolated worker, duplicate preflight/runtime rejection, limits, expiry/reuse/revocation, ten concurrent requests and ten concurrent redeems each yield one success; original code/claims unchanged; rollback removes access. Local database: '+db)
