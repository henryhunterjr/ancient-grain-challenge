-- DRAFT ONLY. Requires explicit approval of the new worker role and deployment.
-- No entrant/code/claim data is modified. No credential is created by this file.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
do $$ begin
  if exists(select 1 from public.entrants group by lower(btrim(email::text)) having count(*)>1) then
    raise exception 'Resolve ambiguous normalized entrant email addresses before enabling recovery';
  end if;
  if exists(select 1 from pg_roles where rolname='agc_entry_recovery_worker') then
    raise exception 'Recovery worker role already exists; inspect rather than overwrite';
  end if;
  if exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    where n.nspname='public' and a.grantee=0 and a.privilege_type='CREATE')
    or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      where n.nspname='public' and c.relkind in ('r','v','m','p','f') and a.grantee=0) then
    raise exception 'PUBLIC application table/schema privileges found; review before adding a login';
  end if;
end $$;
-- Only these three application functions currently inherit PUBLIC execution.
-- Preserve every existing explicit grant; refuse schema/ACL drift for review.
do $$ declare f regprocedure; api_role text; begin
  foreach f in array array[
    'public.register(text,text,text,text,text,text,text,boolean,boolean,text)'::regprocedure,
    'public.winners()'::regprocedure,
    'public.admin_draw(text,text,text,text)'::regprocedure] loop
    foreach api_role in array array['anon','authenticated','service_role'] loop
      if not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a join pg_roles r on r.oid=a.grantee
        where p.oid=f and r.rolname=api_role and a.privilege_type='EXECUTE') then
        raise exception 'Expected explicit API function grant missing; review current ACLs';
      end if;
    end loop;
    if not exists(select 1 from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid=f and a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception 'Expected PUBLIC function grant missing; review current ACLs';
    end if;
  end loop;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')
      and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
      and p.oid<>all(array['public.register(text,text,text,text,text,text,text,boolean,boolean,text)'::regprocedure::oid,
        'public.winners()'::regprocedure::oid,'public.admin_draw(text,text,text,text)'::regprocedure::oid])) then
    raise exception 'Additional PUBLIC application functions found; review before adding a login';
  end if;
end $$;
revoke execute on function public.register(text,text,text,text,text,text,text,boolean,boolean,text),public.winners(),public.admin_draw(text,text,text,text) from public;
create role agc_entry_recovery_worker nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 10;
alter role agc_entry_recovery_worker set search_path='';
create schema agc_entry_recovery;
revoke all on schema agc_entry_recovery from public,anon,authenticated,service_role;
grant usage on schema agc_entry_recovery to agc_entry_recovery_worker;
create table agc_entry_recovery.links (
  token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
  entrant_id uuid not null references public.entrants(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '15 minutes',
  used_at timestamptz
);
create index on agc_entry_recovery.links(expires_at);
create table agc_entry_recovery.limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null,
  last_allowed timestamptz not null
);
alter table agc_entry_recovery.links enable row level security;
alter table agc_entry_recovery.limits enable row level security;
revoke all on all tables in schema agc_entry_recovery from public,anon,authenticated,service_role,agc_entry_recovery_worker;

create function agc_entry_recovery.take_limit(p_key text,p_seconds integer,p_max integer,p_wait integer default 0)
returns boolean language plpgsql set search_path='' as $$
declare now_at timestamptz:=clock_timestamp(); bucket timestamptz; row agc_entry_recovery.limits;
begin
  bucket:=to_timestamp(floor(extract(epoch from now_at)/p_seconds)*p_seconds);
  select * into row from agc_entry_recovery.limits where key=p_key for update;
  if found and (row.last_allowed>now_at-make_interval(secs=>p_wait)
    or (row.window_start=bucket and row.hits>=p_max)) then return false; end if;
  insert into agc_entry_recovery.limits values(p_key,bucket,1,now_at)
    on conflict(key) do update set window_start=bucket,
      hits=case when agc_entry_recovery.limits.window_start=bucket then agc_entry_recovery.limits.hits+1 else 1 end,
      last_allowed=now_at;
  return true;
end $$;
revoke all on function agc_entry_recovery.take_limit(text,integer,integer,integer) from public,anon,authenticated,service_role,agc_entry_recovery_worker;

create function agc_entry_recovery.entry_recovery_issue(p_email text,p_token_hash text,p_email_hash text,p_ip_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare match_id uuid; recipient text; matches integer;
begin
  if p_email is null or length(p_email)>254 or p_email<>lower(btrim(p_email))
    or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$'
    or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then return '{}'::jsonb; end if;
  perform pg_advisory_xact_lock(hashtextextended('agc_entry_recovery_request',0));
  delete from agc_entry_recovery.links where expires_at<clock_timestamp()-interval '24 hours';
  delete from agc_entry_recovery.limits where last_allowed<clock_timestamp()-interval '24 hours';
  if not agc_entry_recovery.take_limit('request-global',3600,100) then return '{}'::jsonb; end if;
  if not agc_entry_recovery.take_limit('request-ip:'||p_ip_hash,900,10) then return '{}'::jsonb; end if;
  if not agc_entry_recovery.take_limit('request-email:'||p_email_hash,3600,3,60) then return '{}'::jsonb; end if;
  select count(*) into matches from public.entrants where lower(btrim(email::text))=p_email;
  if matches<>1 then return '{}'::jsonb; end if;
  select id,email::text into match_id,recipient from public.entrants where lower(btrim(email::text))=p_email;
  insert into agc_entry_recovery.links(token_hash,entrant_id) values(p_token_hash,match_id);
  return jsonb_build_object('recipient',recipient);
end $$;

create function agc_entry_recovery.entry_recovery_redeem(p_token_hash text,p_ip_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare match_id uuid;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('agc_entry_recovery_redeem',0));
  if not agc_entry_recovery.take_limit('redeem-global',3600,300)
    or not agc_entry_recovery.take_limit('redeem-ip:'||p_ip_hash,900,30) then return null; end if;
  update agc_entry_recovery.links set used_at=clock_timestamp()
    where token_hash=p_token_hash and used_at is null and expires_at>clock_timestamp()
    returning entrant_id into match_id;
  if match_id is null then return null; end if;
  return (select jsonb_build_object('token',token,'first_name',split_part(full_name,' ',1)) from public.entrants where id=match_id);
end $$;

create function agc_entry_recovery.entry_recovery_revoke(p_token_hash text)
returns void language sql security definer set search_path='' as $$
  update agc_entry_recovery.links set used_at=clock_timestamp() where token_hash=p_token_hash and used_at is null;
$$;
revoke all on function agc_entry_recovery.entry_recovery_issue(text,text,text,text),agc_entry_recovery.entry_recovery_redeem(text,text),agc_entry_recovery.entry_recovery_revoke(text)
  from public,anon,authenticated,service_role;
grant execute on function agc_entry_recovery.entry_recovery_issue(text,text,text,text),agc_entry_recovery.entry_recovery_redeem(text,text),agc_entry_recovery.entry_recovery_revoke(text)
  to agc_entry_recovery_worker;
commit;
