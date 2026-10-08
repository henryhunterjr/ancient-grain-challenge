-- SEPARATE APPROVAL REQUIRED: adopt entry-code-only recovery and a verified
-- support process for people who lose their code and their saved session.
-- Existing tokens and browser sessions remain valid. No tokens are rotated.
begin;
do $$
begin
  if md5(pg_get_functiondef('public.recover(text,text)'::regprocedure)) <> '9eb391a4b8f98271eac6c7736eafadd8' then
    raise exception 'Live recovery function changed. Reinspect before applying.';
  end if;
end $$;
create or replace function public.recover(p_email text, p_skool_name text)
returns json language sql stable set search_path = '' as $$
  select json_build_object('error','entry_code_required');
$$;
-- The obsolete endpoint must not be able to disclose a bearer token, even if
-- an old client calls it directly. It returns the same result for every identity.
revoke all on function public.recover(text,text) from public, anon, authenticated;
commit;
