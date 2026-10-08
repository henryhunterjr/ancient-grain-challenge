# Muse quiz handoff implementation contract

Status: registry draft, based on recovery branch `33c9ef9`. **Do not enable the production results buttons until Henry approves publication and the registry receiving page plus migration are confirmed live.** This document is ready to copy to Muse; no message has been sent to Muse. No live integration migration, production entry, newsletter subscription, draw or deployment was performed in this task.

## Receiving URL

`https://challenge.bakinggreatbread.com/record-score?quiz=QUIZ_ID&score=PERCENTAGE&total=QUESTION_TOTAL`

| Field | Required | Contract |
| --- | --- | --- |
| `quiz` | Yes | Exact public identifier in the mapping below; no alias, overview ID or lesson title |
| `score` | Yes | Finite percentage from 0 through 100, decimal notation; `80`, `70.5`, `0`, `100` accepted. Not correct-answer count, fraction, exponent, NaN or Infinity |
| `total` | Yes | Positive integer from 1 through 100: actual number of questions graded in this attempt. Module One must send its chosen 5, 10 or 15 total, rather than a fixed total |
| `pass` | No | Optional compatibility field; discarded. Registry derives pass from best score >= 70 |
| `timestamp` | No | Optional compatibility field; discarded. Registry uses its own receipt time |

No duplicate fields or other query keys are accepted. No entry code, email, entrant identifier, API secret, token, authentication session, answers, difficulty or timer data belongs in the link or Muse storage. This is a browser-reported handoff, not trusted grading or independent quiz verification. Muse must never say the registry saved the result: only the registry backend can confirm it.

Example (Module One, 8 correct out of 10):

`https://challenge.bakinggreatbread.com/record-score?quiz=from-berries-to-bread-module-one-kj65x0xbgxctgu&score=80&total=10`

## Canonical seven-lesson mapping

The order below matches the read-only live task list inspected October 8, 2026. All seven public share destinations returned their named quiz share pages. Stable task IDs remain `m1` through `m7`; the denominator remains seven. The `quiz` field equals the final slug of the current Muse share URL.

| Order / task | Registry lesson | Exact `quiz` value | Current quiz destination | Original YouTube IDs |
| --- | --- | --- | --- | --- |
| 1 / `m3` | From Berries to Bread | `from-berries-to-bread-module-one-kj65x0xbgxctgu` | https://muse.ai/s/from-berries-to-bread-module-one-kj65x0xbgxctgu | `smiOhsBluSY` |
| 2 / `m7` | Rye Redefined | `rye-redefined-quiz-lxm6dxqxlxxkxoxkn` | https://muse.ai/s/rye-redefined-quiz-lxm6dxqxlxxkxoxkn | `Lyjw-E4a-Qk` |
| 3 / `m1` | Why Ancient Wheat Dough Feels Different | `why-ancient-wheat-dough-feels-xht6epxj9xxxrrn` | https://muse.ai/s/why-ancient-wheat-dough-feels-xht6epxj9xxxrrn | `QoGpW6hXxz8` |
| 4 / `m2` | The Kneading Fallacy | `the-kneading-fallacy-xox06exr433x0xoxm` | https://muse.ai/s/the-kneading-fallacy-xox06exr433x0xoxm | `1GGZgB2TMgY` |
| 5 / `m4` | Which Wheat Berry Should You Use? | `which-wheat-berry-xyr6exixztixzgi` | https://muse.ai/s/which-wheat-berry-xyr6exixztixzgi | `xWSZYfOUkrw` |
| 6 / `m6` | Mastering Einkorn | `mastering-einkorn-gs6exki0xyxbfxe` | https://muse.ai/s/mastering-einkorn-gs6exki0xyxbfxe | `30SLfbm1fZk` |
| 7 / `m5` | Ancient Grain Sourdough Starter | `ancient-grain-sourdough-starter-jv6exlxjhxj67f` | https://muse.ai/s/ancient-grain-sourdough-starter-jv6exlxjhxj67f | `gK2UtnJUxX8`, `2d-3xPuWsQc` |

YouTube URL pattern: `https://www.youtube.com/watch?v=VIDEO_ID`. No video URL was changed. `m3` still points to the 4:35 intro video. The current quiz share title is **From Berries To Bread Module One**. Muse reports a separate overview titled **From Berry to Bread**; its URL/source was not supplied here and it is not a challenge lesson. Do not infer that it replaces Module One or add an eighth lesson. Any future video/quiz replacement requires Henry's specific direction and mapping review.

Muse's supplied source inspection establishes that six quizzes use the newer template and Module One uses the older difficulty/timer and 5/10/15-question format. The public share wrappers were independently checked here, but direct content-host requests returned share wrappers rather than raw quiz code. Per-template variable names and the six newer totals must therefore be wired from Muse's actual quiz source, not guessed. The receiver supports actual totals from 1 to 100 and does not treat the total as proof of grading integrity.

## Muse results button

Show **Record my score for the giveaway** after grading, including below-passing results. Never call registry RPCs from Muse. Leave the results available so a baker can retry the handoff. Retakes remain allowed.

```js
// Adapt these three inputs to the completed attempt in each quiz source.
// quizId is the exact slug above. total is the questions actually graded.
function registryScoreLink(quizId, percentage, total) {
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100 ||
      !Number.isInteger(total) || total < 1 || total > 100) {
    throw new Error('Invalid completed quiz result');
  }
  const url = new URL('https://challenge.bakinggreatbread.com/record-score');
  url.searchParams.set('quiz', quizId);
  url.searchParams.set('score', String(percentage));
  url.searchParams.set('total', String(total));
  return url.href;
}

// If the quiz stores correct answers rather than percentage:
const percentage = 100 * correctAnswers / gradedQuestions.length;
const href = registryScoreLink(
  'from-berries-to-bread-module-one-kj65x0xbgxctgu',
  percentage,
  gradedQuestions.length
);
const button = document.createElement('a');
button.textContent = 'Record my score for the giveaway';
button.href = href;
button.target = '_blank';
button.rel = 'noopener noreferrer';
resultsPanel.append(button);
```

Button helper text: **“Continue to the challenge registry to register free or sign in and save this browser-reported score. Lesson credit also requires your YouTube comment.”**

Use the completed attempt's percentage without rounding a below-70 result up to passing. Verify outbound navigation in the actual Muse share runtime on mobile and desktop. The inspected share wrapper advertises an iframe sandbox with `allow-scripts`; such a runtime can restrict new windows. Muse must confirm supported outward navigation or provide a visible selectable/copyable nonsecret result URL. A link inside a sandbox cannot grant itself popup permission. No credential, callback or trusted save status is required.

## Registry identity and return behavior

1. Opening a valid result link stores only `{quiz, task, score, total, id, created, expires}` locally. `id` is a random nonsecret pending-result identity for safe replacement/clear, not entrant identity. Client pass/time are discarded and the address bar is scrubbed immediately. The receiver uses `Referrer-Policy: no-referrer` and no-store/noindex headers.
2. Existing entrants use the existing saved browser session or private entry code. Email/name alone cannot authorize access. Muse never sees the code. An invalid session gets a sign-in prompt and sends no score.
3. A new entrant follows the existing free registration form. Zero lessons are required; no Academy membership/payment is required. The existing rules and newsletter consent requirements remain intact. The pending banner offers a direct return to the receiver before and after signup. Signup does not auto-save a result.
4. After sign-in, the receiver names the entry and requires **Save score for [first name]**. **Use a different entry** signs out locally and keeps the pending result. This explicit confirmation prevents silently binding a score to the wrong saved entry.
5. A pending result survives tab closure, reload and interrupted signup for **seven days from its first arrival on this browser and origin**. Reopening the same link while still pending does not extend retention. Open `/record-score` or follow the registration banner to resume. Nothing is stored on Muse. Browser data clearing, private browsing termination or storage being blocked can prevent retention; a visible warning asks the baker to keep the page open when storage is unavailable.
6. Only one result is pending at once. A different incoming attempt requires an explicit replacement choice. **Cancel and clear pending score** and the signup banner's **Clear pending score** remove it. Expired results are removed on read/use, and a new quiz result can then be handed off. This is client-side retry retention, not an extension of the challenge deadline.
7. The pending object has no entrant binding or secret. It is retained on session changes and never automatically saved for the new entry. Each write rechecks the current entry and pending identity; a response for an old session is never presented as confirmation for the new entry. If an in-flight save reached the server before switching, it may already belong to the explicitly confirmed old entry; review that entry's lesson progress. Retries are safe.
8. If signup committed but its response was lost, the existing registration endpoint may return “already registered.” Restore access with a saved entry code or the approved identity-checked support process. Do not recover by email alone. The nonsecret pending score remains available without a retake during its retention window.

## Backend guarantees

`record_quiz_score(p_token uuid, p_quiz_id text, p_score numeric, p_total integer)` authenticates the existing bearer entry code in the request body; it does not accept entrant ID, client pass or client timestamp. `my_quiz_results(p_token)` reads only that nondisqualified entry's scores. `record_lesson_comment(p_token, p_task_key, p_youtube_name)` records the baker's existing self-report comment details. These RPCs use the registry's existing publishable API helper, not a secret key or new auth system.

The table is RLS enabled with direct public/anonymous/authenticated access revoked. Internal helper execution is revoked. Validation accepts only known active canonical modules, finite 0–100 percentages and integer question totals 1–100. Each entry row is locked before writes; one `(entrant_id, task_key)` row stores only the best score and its question total/server receipt time plus comment name when supplied. Ties and lower retakes do not rewrite the best result. No answer history, client timestamps, pass flags or entry tokens are stored in this table.

The existing published cutoff/countdown is Nov 29, 2026 at 11:59 pm Eastern. Receipt is taken with `clock_timestamp()` after acquiring the entry lock and is rejected at or after **2026-11-30T05:00:00Z**. Backdated Muse timestamps and local seven-day retention cannot bypass it. A retry that arrives after cutoff is rejected; previously saved scores can still be viewed through the lesson page.

Score-only storage earns **zero lesson points**. A best score >=70 plus explicitly saved comment details uses the existing `claim_task` self-report policy. One unique existing claim contributes lesson points once; no new review gate, bonus credit, draw, denominator change or membership requirement is introduced. Comment details may be saved below 70; a later passing handoff then completes that lesson. Passing first and commenting afterward also completes it. Existing historical valid claims and manual self-reported lesson completion continue under the prepared release. Rejected/missing claims are resubmitted through the same existing behavior when both requirements are provided. Draw-time YouTube review remains unchanged.

## Success and error copy

| State | Copy |
| --- | --- |
| Backend confirmed, comment still needed | “Score saved: 80%” / “Your passing score is saved. This lesson still needs your YouTube comment details before it earns lesson points.” |
| Backend confirmed, below passing | “Your score is saved. Retake the quiz for 70% or better. Lesson points also require your YouTube comment details.” |
| Both satisfied | “This lesson is complete. Your existing progress and points are updated.” |
| Comment saved after pass | “Comment details saved. Lesson complete; your progress and points are updated.” |
| Network/uncertain response | “Could not confirm the save. Your pending score is kept. Retry safely; repeats cannot add points twice.” |
| Invalid identity | “Your entry session is no longer valid. Sign in with your private entry code, then retry.” |
| Bad link | “This result link is invalid. Return to your quiz and use its results button.” |
| Deadline | “Challenge check-offs have closed. This result cannot be added to the giveaway.” |
| Missing/expired/cleared pending | “No pending result. It may have been saved, cleared, or expired after seven days.” |

## Review, verification and publication

Read-only production inspection found no `entrants.is_test` column, so the earlier prepared release is not confirmed applied. The new migration refuses to run unless its validation helper, test flag, revoked email/name recovery and canonical seven active modules are present. It does not run or repeat those migrations. Keep this PR stacked on `proposal/entry-code-recovery` until the existing repairs land, then retarget/rebase and reinspect compatibility.

Review migration: `supabase/migrations/20261008020550_muse_quiz_handoff.sql`. Reviewed local rollback: `database/rollback-muse-quiz-handoff.sql`. Rollback removes all five new RPC/helper functions, retains the private score table and valid lesson claims, and does not erase any entrant's recorded best result. Restore the earlier frontend or disable the receiver before rollback; retained table data permits a separately reviewed recovery migration rather than silent data loss.

Local PostgreSQL 17 verification: prior score-validation regressions, new identity/validation/ownership tests, score/comment ordering, no score-only points, invalid/inactive lesson and overview rejection, disqualified access, lower/equal/higher retakes, finite number handling, deadline tests, direct-table/helper permissions and ten concurrent PostgreSQL sessions. Rollback preserves all result rows and keeps them private. Synthetic entrants use `example.invalid` and newsletter=false; no draw is executed. `tests/run-database.py` connects only to 127.0.0.1 and creates its own `agc_muse_test_*` database; only synthetic snapshot guards are stripped in memory for local fixture setup.

Browser verification uses headless Chrome at 393 and 1440 CSS pixels, with every external request intercepted or blocked. It covers closed-page retention, signup and interrupted signup, entry-code login, no credentials in URLs/pending payload, invalid sessions, network retry, double clicks, explicit replacement, expiration, forged params, cleared/changed tabs, switched entries during save, disabled storage and lesson comment integration. Captures are `test-output/score-mobile.png` and `score-desktop.png`, excluded from deployment. This verifies registry behavior against synthetic API responses; live Muse button navigation and production end-to-end storage remain publication checks.

Run browser tests: `npm ci && npm test` (Windows: explicit `C:/Program Files/nodejs/npm.cmd`, or invoke `C:/Program Files/nodejs/node.exe node_modules/@playwright/test/cli.js test`). Run database tests with explicit Python path and `PG_BIN` / `AGC_TEST_PG_PORT` for the disposable local PostgreSQL instance. Run local visual preview with `npm run preview`, then open `http://127.0.0.1:4178/record-score`.

Publication requires Henry's separate approval for this integration, completion/reinspection of the existing fixes, applying this isolated migration, publishing the receiver, then Muse wiring/testing the seven source buttons including the sandbox behavior. The planned production URL is not a live-save guarantee until those steps are complete. No production smoke test should create a newsletter subscription or conduct a draw.

This draft branch explicitly disables automatic Vercel deployment for `feature/muse-quiz-score-handoff` in `vercel.json`, preserving the no-deploy instruction while allowing an ordinary draft PR. Other branches retain their current deployment behavior. [Vercel's branch configuration](https://vercel.com/docs/project-configuration/git-configuration) documents this setting. The available tested preview is local with intercepted synthetic API responses, not a hosted/live database preview.
