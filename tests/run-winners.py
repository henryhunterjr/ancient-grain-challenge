"""Disposable localhost PostgreSQL check for the winner fulfillment migration. Never connects to production.

Usage: python3 tests/run-winners.py   (env: PG_BIN, AGC_TEST_PG_PORT, AGC_TEST_PG_HOST)
"""
import os, pathlib, subprocess, sys, time

ROOT = pathlib.Path(__file__).resolve().parents[1]
BIN = pathlib.Path(os.environ.get('PG_BIN', '/usr/lib/postgresql/16/bin'))
HOST = os.environ.get('AGC_TEST_PG_HOST', '127.0.0.1')
PORT = os.environ.get('AGC_TEST_PG_PORT', '55439')
DB = 'agc_winners_test_' + str(int(time.time()))
EXE = '.exe' if os.name == 'nt' else ''
if HOST not in ('127.0.0.1', 'localhost', '::1'):
    raise RuntimeError('Disposable test runner accepts localhost only')
ARGS = ['-h', HOST, '-p', PORT, '-U', 'postgres', '-w', '-d', DB, '-v', 'ON_ERROR_STOP=1', '-At']
ENV = {**os.environ, 'PGCLIENTENCODING': 'UTF8'}

def sql(source):
    out = subprocess.run([str(BIN/('psql'+EXE)), *ARGS], input=source, text=True, encoding='utf-8', capture_output=True, env=ENV, cwd=ROOT)
    if out.returncode:
        raise RuntimeError(out.stderr)
    return out.stdout + out.stderr

def read(path):
    return (ROOT/path).read_text(encoding='utf-8')

def strip_guard(text):
    start = text.index('do $$'); end = text.index('end $$;', start) + len('end $$;')
    return text[:start] + text[end:]

subprocess.run([str(BIN/('createdb'+EXE)), '-h', HOST, '-p', PORT, '-U', 'postgres', '-w', DB], check=True, env=ENV)
baseline = read('tests/baseline-schema.sql').replace('\\ir baseline-functions.sql', read('tests/baseline-functions.sql'))
sql(baseline)
sql(strip_guard(read('database/launch-validation.sql')))
sql(read('supabase/migrations/20261016150000_winner_fulfillment.sql'))
print(sql(read('tests/winners.sql')).strip()[-160:])
# Applying the migration twice must be harmless (create if not exists, replace functions, backfill on conflict).
sql(read('supabase/migrations/20261016150000_winner_fulfillment.sql'))
sql("insert into settings values('admin_hash',encode(extensions.digest('local-only-test','sha256'),'hex')) on conflict(key) do update set value=excluded.value;")
from winners_concurrency import run
run(sql, BIN/('psql'+EXE), ARGS, ENV)
print(f'PASS: migration is re-runnable. Local database: {DB}')
