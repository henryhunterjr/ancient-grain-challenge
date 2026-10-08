-- Disable delivery first, restore prior frontend/API, then apply after approval.
-- Existing entrants, codes, scores, claims and browser sessions are untouched.
begin;
drop function public.entry_recovery_issue(text,text,text,text);
drop function public.entry_recovery_redeem(text,text);
drop function public.entry_recovery_revoke(text);
revoke agc_entry_recovery_worker from authenticator;
revoke usage on schema public from agc_entry_recovery_worker;
drop role agc_entry_recovery_worker;
-- Retain private hashes/rate data until the approved retention cleanup.
-- There is no readable recovery endpoint and the retained tables remain private.
commit;
