do $$ declare v jsonb; before_code uuid; before_claims integer; begin
  if has_function_privilege('anon','public.entry_recovery_issue(text,text,text,text)','execute')
    or has_function_privilege('authenticated','public.entry_recovery_redeem(text,text)','execute')
    or has_function_privilege('service_role','public.entry_recovery_redeem(text,text)','execute')
    or has_table_privilege('agc_entry_recovery_worker','public.entrants','select')
    or has_function_privilege('anon','agc_entry_recovery.take_limit(text,integer,integer,integer)','execute') then raise exception 'Recovery access isolation failed'; end if;
  select token into before_code from entrants where email='synthetic-recovery@example.invalid';
  select count(*) into before_claims from claims;
  v:=entry_recovery_issue('synthetic-recovery@example.invalid',repeat('a',64),repeat('b',64),repeat('c',64));
  if v->>'recipient'<>'synthetic-recovery@example.invalid' or v ? 'token' then raise exception 'Issue leaks or missing delivery'; end if;
  if entry_recovery_issue('synthetic-recovery@example.invalid',repeat('d',64),repeat('b',64),repeat('c',64))<>'{}'::jsonb then raise exception 'Email cooldown failed'; end if;
  if entry_recovery_issue('unknown@example.invalid',repeat('e',64),repeat('f',64),repeat('a',64))<>'{}'::jsonb then raise exception 'Unknown email exposed'; end if;
  v:=entry_recovery_redeem(repeat('a',64),repeat('a',64));
  if (v->>'token')::uuid<>before_code then raise exception 'Original code not recovered'; end if;
  if entry_recovery_redeem(repeat('a',64),repeat('a',64)) is not null then raise exception 'Credential reuse allowed'; end if;
  if (select token from entrants where email='synthetic-recovery@example.invalid')<>before_code or (select count(*) from claims)<>before_claims then raise exception 'Existing identity/claims altered'; end if;
end $$;

-- Hourly email limits remain effective across cooldowns; no duplicates recover.
do $$ declare i integer; v jsonb; before_links integer; begin
  delete from agc_entry_recovery.limits;
  for i in 1..4 loop
    update agc_entry_recovery.limits set last_allowed=clock_timestamp()-interval '61 seconds'
      where key='request-email:'||repeat('5',64);
    v:=entry_recovery_issue('synthetic-recovery@example.invalid',md5('hour'||i)||md5('hour'||i),repeat('5',64),repeat('6',64));
    if (i<=3 and not(v ? 'recipient')) or (i=4 and v<>'{}'::jsonb) then raise exception 'Email hourly limit failed'; end if;
  end loop;
  if (select hits from agc_entry_recovery.limits where key='request-email:'||repeat('5',64))<>3 then raise exception 'Email limit counter failed'; end if;
  delete from agc_entry_recovery.limits;
  select count(*) into before_links from agc_entry_recovery.links;
  insert into entrants(email,full_name,skool_name,country,newsletter,rules_accepted)
    values(' synthetic-recovery@example.invalid ','Synthetic Ambiguous','Other','United States',false,true);
  v:=entry_recovery_issue('synthetic-recovery@example.invalid',repeat('7',64),repeat('8',64),repeat('9',64));
  if v<>'{}'::jsonb or (select count(*) from agc_entry_recovery.links)<>before_links then raise exception 'Ambiguous email recovered'; end if;
  delete from entrants where email=' synthetic-recovery@example.invalid ';
end $$;

do $$ declare id uuid; begin
  select entrants.id into id from entrants where email='synthetic-recovery@example.invalid';
  insert into agc_entry_recovery.links(token_hash,entrant_id,expires_at) values(repeat('1',64),id,clock_timestamp()-interval '1 second');
  if entry_recovery_redeem(repeat('1',64),repeat('a',64)) is not null then raise exception 'Expired credential accepted'; end if;
  insert into agc_entry_recovery.links(token_hash,entrant_id) values(repeat('2',64),id);
  perform entry_recovery_revoke(repeat('2',64));
  if entry_recovery_redeem(repeat('2',64),repeat('a',64)) is not null then raise exception 'Revoked credential accepted'; end if;
end $$;

do $$ declare i integer; v jsonb; begin
  delete from agc_entry_recovery.limits;
  for i in 1..11 loop
    v:=entry_recovery_issue('unknown'||i||'@example.invalid',md5(i::text)||md5(i::text),md5('email'||i)||md5('email'||i),repeat('9',64));
  end loop;
  if (select hits from agc_entry_recovery.limits where key='request-ip:'||repeat('9',64))<>10 then raise exception 'IP limit failed'; end if;
  delete from agc_entry_recovery.limits;
  for i in 1..101 loop
    perform entry_recovery_issue('unknown'||i||'@example.invalid',md5(i::text)||md5(i::text),md5('email'||i)||md5('email'||i),md5('ip'||i)||md5('ip'||i));
  end loop;
  if (select hits from agc_entry_recovery.limits where key='request-global')<>100 then raise exception 'Global limit failed'; end if;
end $$;
