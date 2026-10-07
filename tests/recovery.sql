-- LOCAL ONLY, separate recovery proposal tests. No identities/tokens are read.
do $$
begin
  if recover('synthetic@example.invalid','Synthetic Baker')->>'error'<>'entry_code_required' then raise exception 'Identity recovery still discloses access'; end if;
  if recover('unknown@example.invalid','Unknown')->>'error'<>'entry_code_required' then raise exception 'Recovery discloses identity existence'; end if;
  if has_function_privilege('anon','public.recover(text,text)','execute') or has_function_privilege('authenticated','public.recover(text,text)','execute') then raise exception 'Obsolete recovery remains public'; end if;
  if not has_function_privilege('anon','public.my_progress(uuid)','execute') then raise exception 'Saved entry code loses access'; end if;
end $$;
select 'PASS: recovery returns no bearer token, identity-independent response, obsolete endpoint revoked, saved code RPC retained' as result;
