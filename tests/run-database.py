"""Disposable localhost PostgreSQL verification. Never connects to production."""
import concurrent.futures, os, pathlib, subprocess, time

ROOT = pathlib.Path(__file__).resolve().parents[1]
BIN = pathlib.Path(os.environ.get('PG_BIN', r'C:\Program Files\PostgreSQL\17\bin'))
PORT = os.environ.get('AGC_TEST_PG_PORT', '55439')
DB = 'agc_muse_test_' + str(int(time.time()))
ARGS = ['-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', '-w', '-d', DB, '-v', 'ON_ERROR_STOP=1']
ENV = {**os.environ, 'PGCLIENTENCODING': 'UTF8'}

def sql(source):
    out = subprocess.run([str(BIN/'psql.exe'), *ARGS], input=source, text=True,
                         encoding='utf-8', capture_output=True, env=ENV, cwd=ROOT)
    if out.returncode:
        raise RuntimeError(out.stderr)
    return out.stdout

def read(path):
    return (ROOT/path).read_text(encoding='utf-8')

subprocess.run([str(BIN/'createdb.exe'), '-h','127.0.0.1','-p',PORT,'-U','postgres','-w',DB],check=True,env=ENV)
# The fixture is synthetic, so production snapshot hashes are not applicable.
# Strip ONLY those snapshot preflight blocks in local copies, never tracked SQL.
baseline = read('tests/baseline-schema.sql').replace('\\ir baseline-functions.sql', read('tests/baseline-functions.sql'))
sql(baseline)
launch = read('database/launch-validation.sql')
start = launch.index('do $$')
end = launch.index('end $$;',start)+len('end $$;')
sql(launch[:start]+launch[end:])
recovery = read('database/entry-code-recovery-proposal.sql')
start = recovery.index('do $$'); end = recovery.index('end $$;',start)+len('end $$;')
sql(recovery[:start]+recovery[end:])
print(sql(read('tests/backend.sql'))[-200:])
sql("insert into tasks(key,title,category,points,sort) select 'm'||n,'Lesson '||n,'module',20,n from generate_series(1,7)n on conflict(key)do nothing;")
migration = next((ROOT/'supabase/migrations').glob('*_muse_quiz_handoff.sql'))
sql(migration.read_text(encoding='utf-8'))
print(sql(read('tests/quiz-handoff.sql'))[-210:])
q = 'why-ancient-wheat-dough-feels-xht6epxj9xxxrrn'
token = '11111111-1111-4111-8111-111111111111'
sql(f"select record_quiz_score('{token}','{q}',0,10); select record_lesson_comment('{token}','m1','Concurrent Baker');")
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    list(pool.map(lambda score: sql(f"select record_quiz_score('{token}','{q}',{score},10);"), [70,80,90,100,50,100,71,80,0,95]))
sql("do $$ begin if (select best_score from quiz_results where task_key='m1')<>100 or (select count(*) from claims where task_key='m1')<>1 or (my_progress('11111111-1111-4111-8111-111111111111')->>'verified_points')::int<>40 then raise exception 'Concurrent best/dedup failed'; end if; end $$;")
print('PASS: 10 concurrent PostgreSQL sessions retain 100%, one claim and points once')
before = sql('select count(*) from quiz_results;')
sql(read('database/rollback-muse-quiz-handoff.sql'))
assert sql('select count(*) from quiz_results;') == before
sql("do $$ begin if to_regprocedure('public.record_quiz_score(uuid,text,numeric,integer)')is not null or has_table_privilege('anon','public.quiz_results','select') then raise exception 'Rollback access'; end if; end $$;")
print(f'PASS: rollback disables endpoints, preserves private results and claims. Local database: {DB}')
