"""Verify exact-row copy updates and atomic mismatch rollback on localhost only."""
import os, pathlib, subprocess, time
root=pathlib.Path(__file__).resolve().parents[1]
bin=pathlib.Path(os.environ.get('PG_BIN',r'C:\Program Files\PostgreSQL\17\bin'))
port=os.environ.get('AGC_TEST_PG_PORT','55439')
db='agc_copy_test_'+str(int(time.time()))
env={**os.environ,'PGCLIENTENCODING':'UTF8'}
args=['-h','127.0.0.1','-p',port,'-U','postgres','-w','-d',db,'-v','ON_ERROR_STOP=1','-At']
subprocess.run([str(bin/'createdb.exe'),'-h','127.0.0.1','-p',port,'-U','postgres','-w',db],check=True,env=env)
def sql(source,ok=True):
    result=subprocess.run([str(bin/'psql.exe'),*args],input=source,text=True,encoding='utf-8',capture_output=True,env=env)
    if ok and result.returncode: raise RuntimeError(result.stderr)
    if not ok and not result.returncode: raise AssertionError('Expected source mismatch rejection')
    return result.stdout.strip()
sql("""create table tasks(key text primary key,title text,description text,category text,points int,active boolean,sort int,proof_hint text);
insert into tasks values
('m1','Wheat','Einkorn, emmer and spelt explained. Watch the lesson on this page, then check it off.','module',20,true,1,'Keep hint'),
('m2','Kneading','Why over-mixing can weaken fresh-milled and ancient grain dough. Watch the lesson, then check it off.','module',20,true,2,'Keep hint'),
('m4','Berries','Hard red, hard white and soft white wheat. Watch the lesson, then check it off.','module',20,true,4,'Keep hint'),
('m5','Starter','What changes when you change the grain. Watch both starter videos, then check it off.','module',20,true,5,'Keep hint'),
('m6','Einkorn','Why this ancient grain does not behave like modern wheat. Watch the lesson, then check it off.','module',20,true,6,'Keep hint'),
('m3','Intro','Keep intro quiz copy','module',20,true,3,'Keep hint'),
('m7','Rye','Why rye dough does not behave like wheat. Watch the lesson, then take the quiz and pass at 70% or better.','module',20,true,7,'Keep hint'),
('intro','Bonus','Keep bonus copy','bonus',5,true,8,'Keep hint');""")
snapshot="select jsonb_agg(to_jsonb(t) order by key) from tasks t;"
metadata="select jsonb_agg(to_jsonb(t)-'description' order by key) from tasks t;"
original=sql(snapshot);meta=sql(metadata)
script=(root/'database/prelaunch-task-copy.sql').read_text(encoding='utf-8')
sql("update tasks set description='Unexpected source edit' where key='m6';")
mismatch=sql(snapshot)
sql(script,ok=False)
assert sql(snapshot)==mismatch,'Mismatch failed to roll back all updates'
sql("update tasks set description='Why this ancient grain does not behave like modern wheat. Watch the lesson, then check it off.' where key='m6';")
assert sql(snapshot)==original
sql(script)
assert sql(metadata)==meta,'Task metadata changed'
assert sql("select count(*) from tasks where key in ('m1','m2','m4','m5','m6') and description like '%then take the quiz and pass at 70% or better.';")=='5'
assert sql("select description from tasks where key='m5';").startswith('What changes when you change the grain. Watch both starter videos,')
updated=sql(snapshot)
sql(script,ok=False)
assert sql(snapshot)==updated,'Repeat changed descriptions'
print('PASS: five exact descriptions changed; metadata and other rows preserved; mismatched source and repeated update roll back atomically. Local database: '+db)
