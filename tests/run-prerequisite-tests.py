"""Verify prerequisite release independently in disposable localhost databases."""
import os, pathlib, subprocess, time
ROOT=pathlib.Path(__file__).resolve().parents[1]
BIN=pathlib.Path(os.environ.get('PG_BIN',r'C:\Program Files\PostgreSQL\17\bin'))
PORT=os.environ.get('AGC_TEST_PG_PORT','55439')
ENV={**os.environ,'PGCLIENTENCODING':'UTF8'}
def read(p): return (ROOT/p).read_text(encoding='utf-8')
def run(db,query):
    r=subprocess.run([str(BIN/'psql.exe'),'-h','127.0.0.1','-p',PORT,'-U','postgres','-w','-d',db,'-v','ON_ERROR_STOP=1'],input=query,text=True,encoding='utf-8',capture_output=True,cwd=ROOT,env=ENV)
    if r.returncode: raise RuntimeError(r.stderr)
    return r.stdout
baseline=read('tests/baseline-schema.sql').replace('\\ir baseline-functions.sql',read('tests/baseline-functions.sql'))
launch=read('database/launch-validation.sql');start=launch.index('do $$');end=launch.index('end $$;',start)+len('end $$;')
for n,name in enumerate(['test-flags','claim-cleanup','draws']):
    db=f'agc_release_test_{int(time.time())}_{n}'
    subprocess.run([str(BIN/'createdb.exe'),'-h','127.0.0.1','-p',PORT,'-U','postgres','-w',db],check=True,env=ENV)
    run(db,baseline);run(db,launch[:start]+launch[end:])
    query=read(f'tests/{name}.sql')
    import re
    query=re.sub(r'^\\ir ../(.*)$',lambda m:read(m.group(1).strip()),query,flags=re.M)
    print(run(db,query)[-220:])
    print(f'PASS: {name}; synthetic localhost database {db}')
