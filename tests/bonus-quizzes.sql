-- Synthetic LOCAL database only. Never run fixture inserts in production.
insert into entrants(token,email,full_name,skool_name,country,rules_accepted,newsletter)
values('33333333-3333-4333-8333-333333333333','bonus@example.invalid','Bonus Test','Other','United States',true,false);
do $$
declare t uuid:='33333333-3333-4333-8333-333333333333';
 d text:='why-your-fresh-milled-sourdough-is-xih6muguvxwc6';
 s text:='waking-up-the-berry-quiz-wxp6iak2yanw'; r json; eid uuid; b numeric;
begin
 select id into eid from entrants where token=t;
 if record_quiz_score(gen_random_uuid(),d,100,10)->>'error'<>'entrant' then raise exception 'Unknown entrant accepted'; end if;
 if claim_task(t,'b_dense','YouTube: Test · Score: 100%')->>'error'<>'score_required' then raise exception 'Generic check-off bypassed score'; end if;
 foreach b in array array[-1,101,'NaN'::numeric,'Infinity'::numeric,null] loop
   if record_quiz_score(t,d,b,10)->>'error'<>'score' then raise exception 'Invalid score'; end if;
 end loop;
 if record_quiz_score(t,d,100,0)->>'error'<>'total' then raise exception 'Invalid total'; end if;
 perform record_quiz_score(t,d,70,10);
 perform record_lesson_comment(t,'b_dense','Bonus Baker');
 if (select verified_points from _scores where entrant_id=eid)<>0 then raise exception 'Dense 70 incorrectly credited'; end if;
 r:=record_quiz_score(t,d,79.999,10);
 if (r->>'passed')::boolean or (r->>'lesson_complete')::boolean then raise exception 'Dense threshold rounded up'; end if;
 r:=record_quiz_score(t,d,80,10);
 if not (r->>'passed')::boolean or not (r->>'lesson_complete')::boolean then raise exception 'Dense 80 not credited'; end if;
 perform record_quiz_score(t,d,50,10);
 perform record_lesson_comment(t,'b_dense','Bonus Baker');
 if (select verified_points from _scores where entrant_id=eid)<>20 then raise exception 'Dense repeated credit'; end if;
 if (select best_score from quiz_results where entrant_id=eid and task_key='b_dense')<>80 then raise exception 'Best score lowered'; end if;
 perform record_quiz_score(t,s,69.999,10);
 perform record_lesson_comment(t,'b_sprouted','Bonus Baker');
 if (select verified_points from _scores where entrant_id=eid)<>20 then raise exception 'Sprouted below threshold credited'; end if;
 r:=record_quiz_score(t,s,70,10);
 if not (r->>'lesson_complete')::boolean then raise exception 'Sprouted 70 not credited'; end if;
 if (select verified_points from _scores where entrant_id=eid)<>40 then raise exception 'Two bonuses not 40'; end if;
 if (select modules_verified from _scores where entrant_id=eid)<>0 or (select modules_total from _scores where entrant_id=eid)<>7 then raise exception 'Bonuses changed seven-lesson requirement'; end if;
 if exists(select 1 from _draw_pool('weekly') where entrant_id=eid) or exists(select 1 from _draw_pool('grand') where entrant_id=eid) then raise exception 'Bonus-only entrant qualified for grain'; end if;
 if (select weight from _draw_pool('mixer') where entrant_id=eid)<>41 then raise exception 'Mixer bonus weight'; end if;
 if (select entries from agc_entry_recovery.progress_mail_list_v2() where entrant_id=eid)<>41 then raise exception 'Email entries differ from draw'; end if;
 if exists(select 1 from agc_entry_recovery.progress_mail_list_v2() m cross join lateral jsonb_array_elements(m.open_bonus) j where m.entrant_id=eid and j->>'key' in ('b_dense','b_sprouted')) then raise exception 'Completed bonus still open'; end if;
 perform record_quiz_score(t,'from-berries-to-bread-module-one-kj65x0xbgxctgu',70,10);
 if (select verified_points from _scores where entrant_id=eid)<>40 then raise exception 'Module without comment credited'; end if;
 perform record_lesson_comment(t,'m3','Bonus Baker');
 if (select modules_verified from _scores where entrant_id=eid)<>1 then raise exception 'Original module no longer credited'; end if;
 if (select weight from _draw_pool('mixer') where entrant_id=eid)<>61 then raise exception 'Mixer combined points'; end if;
 if not exists(select 1 from _draw_pool('weekly') where entrant_id=eid) then raise exception 'Original weekly eligibility changed'; end if;
 if (select count(*) from claims where entrant_id=eid and task_key in ('b_dense','b_sprouted'))<>2 then raise exception 'Duplicate claim'; end if;
 if has_function_privilege('anon','public._quiz_pass_mark(text)','execute') or has_table_privilege('anon','public.quiz_results','select') then raise exception 'Private internals exposed'; end if;
end $$;
select 'PASS: bonus pass marks, comment requirement, points once, 7 required modules, mixer weights, email counts, ownership and private tables';
