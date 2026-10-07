-- Disposable LOCAL fixture modeled on the read-only production schema snapshot.
-- Never load this fixture into production. Contains no real entrants or secrets.
create schema extensions;
create extension pgcrypto with schema extensions;
create extension citext with schema extensions;
create role anon;
create role authenticated;
create role service_role;
create table public.tasks (
  key text primary key,title text not null,description text not null default '',
  category text not null check(category in ('module','bonus')),points integer not null check(points>0),
  proof_hint text not null default '',link text,sort integer not null default 0,active boolean not null default true);
create table public.entrants (
  id uuid primary key default gen_random_uuid(),token uuid not null unique default gen_random_uuid(),
  email extensions.citext not null unique,full_name text not null,skool_name text not null,country text not null,
  region text not null default '',mill_status text not null default '',experience text not null default '',
  newsletter boolean not null default true,rules_accepted boolean not null,disqualified boolean not null default false,
  admin_notes text not null default '',created_at timestamptz not null default now(),preferred_grain text not null default '');
create table public.claims (
  id uuid primary key default gen_random_uuid(),entrant_id uuid not null references entrants(id) on delete cascade,
  task_key text not null references tasks(key) on update cascade,proof text not null default '',
  status text not null default 'pending' check(status in ('pending','verified','rejected')),
  claimed_at timestamptz not null default now(),reviewed_at timestamptz,unique(entrant_id,task_key));
create table public.settings (key text primary key,value text not null);
create table public.draws (
  id uuid primary key default gen_random_uuid(),prize text not null,entrant_id uuid not null references entrants(id),
  entries integer not null,pool_size integer not null,drawn_at timestamptz not null default now(),kind text not null default 'grand',label text);
alter table tasks enable row level security;
alter table entrants enable row level security;
alter table claims enable row level security;
alter table settings enable row level security;
alter table draws enable row level security;
grant all on tasks,entrants,claims,settings,draws to anon,authenticated,service_role;
create view public._scores as
 SELECT e.id AS entrant_id,
    COALESCE(sum(t.points) FILTER (WHERE c.status = 'verified'::text), 0::bigint)::integer AS verified_points,
    COALESCE(sum(t.points) FILTER (WHERE c.status = 'pending'::text), 0::bigint)::integer AS pending_points,
    ( SELECT count(*) AS count
           FROM tasks m
          WHERE m.category = 'module'::text AND m.active) AS modules_total,
    count(*) FILTER (WHERE c.status = 'verified'::text AND t.category = 'module'::text)::integer AS modules_verified
   FROM entrants e
     LEFT JOIN claims c ON c.entrant_id = e.id
     LEFT JOIN tasks t ON t.key = c.task_key AND t.active
  GROUP BY e.id;
\ir baseline-functions.sql
insert into tasks(key,title,description,category,points,proof_hint) values ('m7','Rye Redefined',
  'Why rye dough does not behave like wheat. Take the quiz, and watch the lesson when the video is posted.',
  'module',20,'Tell us your quiz score, like 8 of 10. Leave it blank if the quiz is not posted yet.');
insert into tasks(key,title,category,points,link) values
  ('bake_grain','Bake with grain','bonus',15,'https://skoo.ly/fresh-mill-recipes'),
  ('bake_fresh','Bake fresh','bonus',15,'https://skoo.ly/fresh-mill-recipes');
