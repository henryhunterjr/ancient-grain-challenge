-- REVIEW ONLY. Disable the receiving page before rollback. Keep private score
-- records for recovery; rollback must not silently erase scores or valid claims.
begin;
drop function public.record_quiz_score(uuid,text,numeric,integer);
drop function public.record_lesson_comment(uuid,text,text);
drop function public.my_quiz_results(uuid);
drop function public._complete_quiz_lesson(uuid,text);
drop function public._quiz_task(text);
-- quiz_results remains RLS enabled with all public/anon/authenticated access revoked.
-- Existing claims/proof/points remain managed by the prepared release.
commit;
