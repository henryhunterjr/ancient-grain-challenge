# Challenge launch repairs — staged, not deployed

Repository: https://github.com/henryhunterjr/ancient-grain-challenge
Branch: `fix/launch-eligibility-validation`. Base: `4b6b506972aac7744bc8becd7228c55772a44303`.
Production: https://challenge.bakinggreatbread.com/ . Supabase project: `pmhytaaajbhzyldmxmzb`.
Date: October 7, 2026. No production writes, entrant changes, draws, merge, or deployment were performed.

## What changed

- Landing steps, lesson overview, rules, Winners, leaderboard explanation and dashboard distinguish one completed lesson for Friday draws (four 5 lb bags each Friday, October 16–November 27) from all seven for the final two 5 lb bags and 25 lb grand prize on December 1. One 5 lb win per person; earlier small winners remain grand eligible. Prize quantities and other legal terms are preserved.
- Lesson UI requires a real finite numeric percentage in 0–100 and at least 70 to complete. Blank, nonnumeric, nonfinite, out-of-range and failing values are rejected. Fractions are explained as percentages: 8 out of 10 means 80. YouTube name/comments remain required; retakes remain allowed.
- `database/launch-validation.sql` enforces the same rule in `claim_task`, prevents admin-review bypass, and updates `_scores`, `my_progress` and Host Desk reporting so an invalid historical check-off cannot qualify a baker or contribute verified points. Its original proof and stored status are retained; the displayed effective status becomes pending and the baker can supply a passing score. Already-valid historical percentages and unambiguous `YouTube: … · Score: 8 of 10` fractions continue to count, unchanged. Valid verified claims cannot be overwritten.
- The score is self-reported. Validation does **not** prove a Muse quiz pass, watching, or mastery. There is no Muse storage/API integration in this change.
- Rye's stale video description and optional-score hints are corrected with exact-value database guards and a targeted frontend fallback. All seven quiz links remain, including Kneading Fallacy.
- Failing Recipe Pantry shortener hops in the recipe section, footer and baking bonus links use https://recipepantry.app/fresh-milled . Affiliate links are preserved.
- Newsletter/rules checkboxes have fixed nonshrinking 22×22 controls and label targets at least 44 pixels tall. Consent requirements remain unchanged.

## Recovery proposal: separate decision before release

The inspected live `recover(text,text)` function discloses a bearer entry token to someone supplying the registered email and full name. Removing its UI is insufficient: it is directly callable.

A separate recovery branch/PR stages code-only returning-entry UI and `database/entry-code-recovery-proposal.sql`, which replaces this lookup with a constant error and revokes public execution. Existing tokens, browser sessions and registrations remain valid; nothing is rotated or deleted. A valid saved code continues to use `my_progress`. Email/name alone no longer grant access.

Henry must approve this transition and establish how support verifies a lost-code request before releasing it. A person with neither their code nor a signed-in device would need this support route. Staff must not issue a code solely because an email/name match was supplied. Do not deploy the recovery UI alone and claim the vulnerability is closed. A future verified-email flow may use existing infrastructure, but no paid service, credential, or new messaging integration has been introduced.

## Read-only draw audit and unresolved decisions

- The active four-argument `admin_draw` uses at least one completed lesson for `weekly`, all active modules for `grand`, excludes prior weekly winners only from weekly draws, and retains them for grand. It excludes disqualified entrants. It has no explicit test-entry flag/filter, no schedule enforcement and no distinct final-two-small-bag December pool. Do **not** select weekly for December's final two bags: it admits one-lesson bakers. An authorized draw change is needed before that event. The old two-argument overload also remains and excludes all prior winners; the current UI calls the four-argument version.
- Preexisting public `Test E.` has five of seven modules, 100 points and is not disqualified: it currently enters the weekly pool. Approved `TEST dot Launch Audit` has zero points and zero modules, so does not enter either pool. Another old test is already disqualified. No test entrant was removed or edited. Henry must authorize exclusion/cleanup; names alone are not a reliable automatic test filter.
- Prize total remains 175 lb (thirty 5 lb bags plus the 25 lb grand prize), pending Henry's business confirmation. Mandatory newsletter and YouTube comments remain in force.
- Saturday Bake Along bonus still requires an Academy activity. This may give paying members a points advantage; Henry's requirement that outside participants can enter free is preserved, but any free alternative/bonus policy needs a decision. No paid requirements were changed.
- The tracked partner email draft still has older wording about nobody winning twice; it was not sent or changed in this repair.

## Verification and release order

Local Node validation matrix and inline script syntax pass. Isolated PostgreSQL 17 tests pass for blank/nonfinite/range/threshold inputs, 70 and 100 boundaries, decimals, historical fractions, preservation/correction of prior proof, eligibility totals, admin bypass prevention, bonus review behavior and RLS. Separate recovery proposal tests verify the code-only transition. No draw function is executed by the tests; draw-definition hashes are checked unchanged.

Playwright tests use intercepted synthetic fixtures and no real API calls. They pass at 393 CSS pixels for checkbox dimensions, entry-code sign-in, client rejection before RPC, passing submission, progress status and direct links; 393-pixel and 1440-pixel renders were inspected. Captures are local in `test-output/` and excluded from Git and deployment. External fonts/YouTube thumbnails were blocked in this isolated run, so this is layout/form QA, not third-party media playback verification.

To rerun frontend checks, use an explicit Node executable:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'tests\frontend.cjs'
$env:AGC_PLAYWRIGHT_PATH='<installed playwright-core package path>'
$env:AGC_CHROMIUM_PATH='<installed chrome.exe path>'
& 'C:\Program Files\nodejs\node.exe' 'tests\browser.cjs'
```

For backend tests, create a fresh **local disposable** PostgreSQL cluster/database; load `tests/baseline-schema.sql`, then `database/launch-validation.sql`, then `tests/backend.sql` with `psql -v ON_ERROR_STOP=1`. Fixtures contain only synthetic data. Never load the baseline schema into production.

Before any release: obtain parent authorization; review the separate recovery transition; refresh Git HEAD and database definitions; audit affected historical claims read-only; then apply the guarded validation SQL before releasing this frontend. Apply the separately approved recovery SQL before releasing its frontend change. SQL checks hashes of the inspected live functions/view and aborts atomically if another editor changed them. Do not bypass a guard without reinspecting. Changing the effective eligibility of incomplete historical claims requires a clear participant communication/support plan; no claim is deleted.

After release, verify the actual custom domain, direct RPC validation on an expressly authorized test fixture, returning-entry code access, phone controls, correct progress/leaderboard counts, preserved quiz/affiliate links and fresh database advisors. A merged PR or frontend deployment alone does not apply these Supabase SQL repairs.
