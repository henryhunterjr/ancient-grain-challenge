-- Email sign-in links last 60 minutes (was 15) so people reading mail on a
-- phone have time to tap through. Links still work once.
alter table agc_entry_recovery.links alter column expires_at set default (clock_timestamp() + interval '60 minutes');
