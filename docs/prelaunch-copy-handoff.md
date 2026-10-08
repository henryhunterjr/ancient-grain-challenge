# Approved pre-launch wording pass

Scope: two official-rules sentences, descriptions for exactly five existing lessons, and removal of the redundant rye description override after confirming the database is canonical. Built on main `4568566312307cdf3d1c2231b70a88003c77f3e1`, preserving the PR #4 cross-tab fix. No eligibility logic, authentication, signup, points, bonuses, claims, prizes, deadlines or video/quiz IDs change.

## Rules wording

Old: "To qualify, you must complete every lesson listed on this page by November 29. If we add a module during the challenge, it's added to the list here."

New: "For weekly Friday draws, complete at least one lesson before that drawing. For the final two 5 lb bags and the 25 lb grand prize on December 1, complete all seven lessons by Sunday, November 29, 2026 at 11:59 pm Eastern."

Old: "Winners are announced in the Academy and contacted by email. If we don't hear back within 7 days, we draw a new winner."

New: "Winners are announced in the Academy and on this page, and contacted by email. If we don't hear back within 7 days, we draw a new winner."

Free registration with zero lessons, the existing YouTube comment/name requirement, draw-time comment review, email contact and seven-day response remain visible and unchanged.

## Exact description changes

| Key | Old | New |
| --- | --- | --- |
| m1 | Einkorn, emmer and spelt explained. Watch the lesson on this page, then check it off. | Einkorn, emmer and spelt explained. Watch the lesson, then take the quiz and pass at 70% or better. |
| m2 | Why over-mixing can weaken fresh-milled and ancient grain dough. Watch the lesson, then check it off. | Why over-mixing can weaken fresh-milled and ancient grain dough. Watch the lesson, then take the quiz and pass at 70% or better. |
| m4 | Hard red, hard white and soft white wheat. Watch the lesson, then check it off. | Hard red, hard white and soft white wheat. Watch the lesson, then take the quiz and pass at 70% or better. |
| m5 | What changes when you change the grain. Watch both starter videos, then check it off. | What changes when you change the grain. Watch both starter videos, then take the quiz and pass at 70% or better. |
| m6 | Why this ancient grain does not behave like modern wheat. Watch the lesson, then check it off. | Why this ancient grain does not behave like modern wheat. Watch the lesson, then take the quiz and pass at 70% or better. |

m3 and m7 already have quiz/pass copy and are unchanged in the database. The frontend now displays the canonical description directly. The starter instruction continues to require both existing videos.

`database/prelaunch-task-copy.sql` changes only `description`, guarded by each stable key, exact old text, active module status and existing 20 points. It requires exactly five updates or rolls back atomically. It also requires rye's corrected canonical description before the override is removed, and compares all non-description task metadata and complete non-target rows inside the locked transaction. Five-second lock and 45-second statement limits prevent a long-running production update. No schema change is required.

Validation: `tests/prelaunch-task-copy.py` uses disposable localhost PostgreSQL to check the exact update, unchanged metadata/other rows, an unexpected source edit rolling back all updates, and a repeated update failing without changes. The existing 17 Chrome tests cover the amended rules, preserved signup/comment requirements, and the PR #4 cross-tab regressions. Public QA after publication must read the actual home and lesson pages and the seven task descriptions; no entrant registration, score, claim or draw is needed.
