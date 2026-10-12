-- DRAFT INCIDENT/PAUSE STEP: approve before applying to production.
-- Revokes function access immediately even for an already authenticated session.
begin;
alter role agc_entry_recovery_worker nologin password null;
revoke execute on function agc_entry_recovery.entry_recovery_issue(text,text,text,text),agc_entry_recovery.entry_recovery_redeem(text,text),agc_entry_recovery.entry_recovery_revoke(text)
  from agc_entry_recovery_worker;
commit;
-- Do not restore grants/LOGIN until the owner has rotated the dedicated password
-- and reviewed the incident. Existing entry codes remain bearer credentials.
