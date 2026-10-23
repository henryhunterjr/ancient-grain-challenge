"""Disposable localhost-only regression checks for bonus quiz credit."""
import os,pathlib,subprocess,time,concurrent.futures
ROOT=pathlib.Path(__file__).resolve().parents[1]
BIN=pathlib.Path(os.environ.get('PG_BIN',r'C:\Program Files\PostgreSQL\17\bin'))
PORT=os.environ.get('AGC_TEST_PG_PORT','55449')
ENV={**os.environ,'PGCLIENTENCODING':'UTF8'}
DB='agc_bonus_'+str(int(time.time()))
ARGS=['-h','127.0.0.1','-p',PORT,'-U','postgres','-w','-d',DB,'-v','ON_ERROR_STOP=1','-At']
def read(p):return (ROOT/p).read_text(encoding='utf-8')
def sql(q):
 r=subprocess.run([str(BIN/'psql.exe'),*ARGS],input=q,text=True,encoding='utf-8',capture_output=True,env=ENV)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout
def strip(q):
 a=q.index('do $$');b=q.index('end $$;',a)+len('end $$;');return q[:a]+q[b:]
subprocess.run([str(BIN/'createdb.exe'),'-h','127.0.0.1','-p',PORT,'-U','postgres','-w',DB],check=True,env=ENV)
sql(read('tests/baseline-schema.sql').replace('\\ir baseline-functions.sql',read('tests/baseline-functions.sql')))
sql(strip(read('database/launch-validation.sql')))
sql(strip(read('database/entry-code-recovery-proposal.sql')))
sql("insert into tasks(key,title,category,points,sort) select 'm'||n,'Lesson '||n,'module',20,n from generate_series(1,7)n on conflict(key)do nothing;")
sql(read('supabase/migrations/20261008020550_muse_quiz_handoff.sql'))
print(sql(read('tests/quiz-handoff.sql')).strip()[-180:])
sql(read('supabase/migrations/20261016150000_winner_fulfillment.sql'))
sql(read('supabase/migrations/20261017230000_nutrimill_mixer.sql'))
sql('create schema agc_entry_recovery;create table agc_entry_recovery.progress_mail_log(entrant_id uuid,sent_at timestamptz);')
sql(strip(read('supabase/migrations/20261023180000_bonus_quiz_credit.sql')))
print(sql(read('tests/bonus-quizzes.sql')).strip()[-210:])
q="select record_quiz_score('33333333-3333-4333-8333-333333333333','why-your-fresh-milled-sourdough-is-xih6muguvxwc6',%s,10);"
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:list(pool.map(lambda n:sql(q%n),[80,100,50,90,100,70,81,99,95,100]))
sql("do $$ begin if (select best_score from quiz_results where task_key='b_dense')<>100 or (select count(*) from claims where task_key='b_dense')<>1 then raise exception 'Concurrent dedup failed';end if;end $$;")
print('PASS: 10 concurrent bonus retakes retain best score and award once. Local database: '+DB)
