"""Concurrent fulfillment checks, called only by the disposable local test runner."""
import subprocess
import time


def run(sql, binary, args, env):
    # Synthetic fixture in the runner's disposable database, never production.
    draw = sql("""
insert into entrants(email,full_name,skool_name,country,region,rules_accepted)
values ('race@example.invalid','Race Baker','Test','United States','OH',true);
insert into draws(prize,entrant_id,entries,pool_size,kind)
select '5 lb bag',id,20,1,'weekly' from entrants where email='race@example.invalid';
select id from draws where entrant_id=(select id from entrants where email='race@example.invalid');
""").strip().splitlines()[-1]
    token = sql(f"select claim_token from winner_fulfillment where draw_id='{draw}';").strip().splitlines()[-1]
    mark = lambda event: f"select admin_winner_mark('local-only-test','{draw}','{event}');"
    claim = f"select winner_claim_submit('{token}','Spelt','Race Baker','2 Race St','','Columbus','OH','43215','United States','');"

    def race(holding, waiting, expected, status, address):
        sql(f"update winner_fulfillment set status='address_received',address1='1 Race St' where draw_id='{draw}';")
        # Keep the first operation uncommitted while the second requests the same row.
        first = subprocess.Popen([str(binary), *args, '-At'], stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                 encoding='utf-8', env={**env, 'PGAPPNAME': 'agc-race-holder'})
        first.stdin.write('begin; ' + holding + ' select pg_sleep(2); commit;\n')
        first.stdin.close()
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if sql("select exists(select 1 from pg_stat_activity where application_name='agc-race-holder' and wait_event='PgSleep');").strip().splitlines()[-1] == 't':
                break
            time.sleep(.03)
        else:
            first.kill()
            raise AssertionError('First transaction did not reach the holding point')
        second = subprocess.Popen([str(binary), *args, '-At', '-c', waiting],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                  encoding='utf-8', env={**env, 'PGAPPNAME': 'agc-race-waiter'})
        blocked = False
        while time.monotonic() < deadline and second.poll() is None:
            if sql("select exists(select 1 from pg_stat_activity where application_name='agc-race-waiter' and wait_event_type='Lock');").strip().splitlines()[-1] == 't':
                blocked = True
                break
            time.sleep(.03)
        out, err = second.communicate(timeout=10)
        first.wait(timeout=10)
        if first.returncode or second.returncode:
            raise AssertionError(err + first.stderr.read())
        assert blocked, 'Concurrent operation did not serialize on the fulfillment row'
        assert expected in out, (expected, out)
        actual = sql(f"select status||'|'||address1 from winner_fulfillment where draw_id='{draw}';").strip().splitlines()[-1]
        assert actual == status + '|' + address, actual

    race(mark('sent_to_partner'), claim, 'locked', 'sent_to_partner', '1 Race St')
    race(mark('shipped'), mark('notified'), 'true', 'shipped', '1 Race St')
    race(claim, mark('sent_to_partner'), 'true', 'sent_to_partner', '2 Race St')
    race(mark('forfeited'), claim, 'closed', 'forfeited', '1 Race St')
    print('PASS: concurrent partner/claim lock, shipped status, submit before partner, forfeit/claim lock')
