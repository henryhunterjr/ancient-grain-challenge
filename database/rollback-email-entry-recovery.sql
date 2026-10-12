-- Disable delivery first, restore prior frontend/API, then apply after approval.
-- Existing entrants, codes, scores, claims and browser sessions are untouched.
begin;
alter role agc_entry_recovery_worker nologin password null;
drop function agc_entry_recovery.entry_recovery_issue(text,text,text,text);
drop function agc_entry_recovery.entry_recovery_redeem(text,text);
drop function agc_entry_recovery.entry_recovery_revoke(text);
revoke usage on schema agc_entry_recovery from agc_entry_recovery_worker;
drop role agc_entry_recovery_worker;
grant execute on function public.register(text,text,text,text,text,text,text,boolean,boolean,text),public.winners(),public.admin_draw(text,text,text,text) to public;
-- Retain private hashes/rate data until the approved retention cleanup.
-- There is no readable recovery endpoint and the retained tables remain private.
commit;
