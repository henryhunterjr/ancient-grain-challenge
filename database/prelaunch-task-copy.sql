-- Approved copy-only correction. Fail atomically if any expected source changed.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
lock table public.tasks in share row exclusive mode;
do $$
declare
  before_metadata jsonb;
  before_other_rows jsonb;
  changed integer;
begin
  if not exists (select 1 from public.tasks where key='m7' and category='module' and active
    and description='Why rye dough does not behave like wheat. Watch the lesson, then take the quiz and pass at 70% or better.') then
    raise exception 'Canonical rye copy must already be corrected before removing its frontend override';
  end if;
  select jsonb_agg(to_jsonb(t)-'description' order by key) into before_metadata from public.tasks t;
  select jsonb_agg(to_jsonb(t) order by key) into before_other_rows from public.tasks t
    where key not in ('m1','m2','m4','m5','m6');
  with expected(key,old_description,new_description) as (values
    ('m1','Einkorn, emmer and spelt explained. Watch the lesson on this page, then check it off.',
      'Einkorn, emmer and spelt explained. Watch the lesson, then take the quiz and pass at 70% or better.'),
    ('m2','Why over-mixing can weaken fresh-milled and ancient grain dough. Watch the lesson, then check it off.',
      'Why over-mixing can weaken fresh-milled and ancient grain dough. Watch the lesson, then take the quiz and pass at 70% or better.'),
    ('m4','Hard red, hard white and soft white wheat. Watch the lesson, then check it off.',
      'Hard red, hard white and soft white wheat. Watch the lesson, then take the quiz and pass at 70% or better.'),
    ('m5','What changes when you change the grain. Watch both starter videos, then check it off.',
      'What changes when you change the grain. Watch both starter videos, then take the quiz and pass at 70% or better.'),
    ('m6','Why this ancient grain does not behave like modern wheat. Watch the lesson, then check it off.',
      'Why this ancient grain does not behave like modern wheat. Watch the lesson, then take the quiz and pass at 70% or better.')
  )
  update public.tasks t set description=e.new_description from expected e
    where t.key=e.key and t.description=e.old_description and t.category='module' and t.active and t.points=20;
  get diagnostics changed=row_count;
  if changed<>5 then raise exception 'Expected exactly five unchanged active 20-point lesson descriptions; got %',changed; end if;
  if before_metadata is distinct from (select jsonb_agg(to_jsonb(t)-'description' order by key) from public.tasks t)
    or before_other_rows is distinct from (select jsonb_agg(to_jsonb(t) order by key) from public.tasks t
      where key not in ('m1','m2','m4','m5','m6')) then
    raise exception 'Copy update changed unrelated task data';
  end if;
end $$;
commit;
