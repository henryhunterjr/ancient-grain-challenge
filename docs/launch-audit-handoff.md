# Challenge launch repairs — staged, not deployed

Repository: https://github.com/henryhunterjr/ancient-grain-challenge
Branch: `fix/launch-eligibility-validation`. Base: `4b6b506972aac7744bc8becd7228c55772a44303`.
Production: https://challenge.bakinggreatbread.com/ . Supabase project: `pmhytaaajbhzyldmxmzb`.
Date: October 7, 2026. No production writes, entrant changes, live draws, merge, or production deployment were performed. Isolated synthetic draw tests were rolled back.

## What changed

- Landing steps, lesson overview, rules, Winners, leaderboard explanation and dashboard distinguish one completed lesson for Friday draws (four 5 lb bags each Friday, October 16–November 27) from all seven for the final two 5 lb bags and 25 lb grand prize on December 1. One 5 lb win per person; earlier small winners remain grand eligible. Prize quantities and other legal terms are preserved.
- Lesson UI requires a real finite numeric percentage in 0–100 and at least 70 to complete. Blank, nonnumeric, nonfinite, out-of-range and failing values are rejected. Fractions are explained as percentages: 8 out of 10 means 80. YouTube name/comments remain required; retakes remain allowed.
- `database/launch-validation.sql` enforces the same rule in `claim_task`, prevents admin-review bypass, and updates `_scores`, `my_progress` and Host Desk reporting so an invalid historical check-off cannot qualify a baker or contribute verified points. Its original proof and stored status are retained; the displayed effective status becomes pending and the baker can supply a passing score. Already-valid historical percentages and unambiguous `YouTube: … · Score: 8 of 10` fractions continue to count, unchanged. Valid verified claims cannot be overwritten.
- The score is self-reported. Validation does **not** prove a Muse quiz pass, watching, or mastery. There is no Muse storage/API integration in this change.
- Rye's stale video description and optional-score hints are corrected with exact-value database guards and a targeted frontend fallback. All seven quiz links remain, including Kneading Fallacy.
- Failing Recipe Pantry shortener hops in the recipe section, footer and baking bonus links use https://recipepantry.app/fresh-milled . Affiliate links are preserved.
- Newsletter/rules checkboxes have fixed nonshrinking 22×22 controls and label targets at least 44 pixels tall. Consent requirements remain unchanged.
- The Host Desk has a distinct `final_small` option for December 1's two 5 lb bags. Its backend pool requires exactly the existing seven active lessons; the weekly pool requires at least one. A prior small win excludes a baker from both small-prize pools while leaving them grand eligible. An advisory transaction lock serializes draws, and published totals are capped at 28 weekly small bags, two final small bags and one grand prize. Prize-kind validation prevents a small prize from using the grand pool. The old ambiguous two-argument overload is removed; defaulted calls route through the guarded grand handler.
- `entrants.is_test` is an explicit default-false flag. It excludes designated tests from every draw pool, public leaderboard and public counts, and appears in Host Desk reporting/CSV. The schema migration does not designate any existing record as a test. There is no name/email heuristic.

## Recovery proposal: separate decision before release

The inspected live `recover(text,text)` function discloses a bearer entry token to someone supplying the registered email and full name. Removing its UI is insufficient: it is directly callable.

A separate recovery branch/PR stages code-only returning-entry UI and `database/entry-code-recovery-proposal.sql`, which replaces this lookup with a constant error and revokes public execution. Existing tokens, browser sessions and registrations remain valid; nothing is rotated or deleted. A valid saved code continues to use `my_progress`. Email/name alone no longer grant access.

Henry must approve this transition and establish how support verifies a lost-code request before releasing it. A person with neither their code nor a signed-in device would need this support route. Staff must not issue a code solely because an email/name match was supplied. Do not deploy the recovery UI alone and claim the vulnerability is closed. A future verified-email flow may use existing infrastructure, but no paid service, credential, or new messaging integration has been introduced.

## Migration impact and unresolved decisions

- The old live handler still has the audit bugs described above until the guarded SQL is authorized and applied. The new draft fixes the December pool and explicit test exclusion. The host still chooses the published draw date and draws four on each Friday; this change does not introduce automatic scheduling or execute a live draw.
- Preexisting public `Test E.` has five of seven modules, 100 points and is not disqualified: it currently enters the weekly pool. Approved `TEST dot Launch Audit` has zero points and zero modules, so does not enter either pool. Another old test is already disqualified. No test entrant was removed or edited. Henry must authorize exclusion/cleanup; names alone are not a reliable automatic test filter.
- Exact proposal: after the schema migration, set `is_test=true` on the two confirmed record IDs in `database/confirmed-test-flags-proposal.sql` only. It locks those rows and verifies their previously inspected full names and false flags before updating exactly two IDs. This is a separate data approval, not part of `launch-validation.sql`. `database/undo-confirmed-test-flags.sql` reverses just those two flags. Records, tokens, claims, proof, newsletter choice and disqualification remain intact.
- Read-only `database/eligibility-impact.sql` models the change without creating a function or writing a record. Four entrant records exist; one is already disqualified. Among three active records, score validation changes two entrants' points, removes one entrant's weekly eligibility and one entrant's December eligibility. It preserves one passing historical fraction and stops counting eleven other module claims until corrected. All original twelve stored verified claims remain intact.

| Current snapshot | Before | After score validation | After scores + separately approved two test flags |
|---|---:|---:|---:|
| Active participating records | 3 | 3 | 1 |
| Weekly eligible | 2 | 1 | 0 |
| December eligible | 1 | 0 | 0 |
| Verified points among participating records | 240 | 20 | 0 |
| Existing live draws | 0 | 0 | 0 |

The remaining passing lesson belongs to the confirmed preexisting test; its effective points become 20 before flagging. The other formerly December-qualified participant needs valid scores recorded. The 0-point launch audit remains ineligible throughout. Counts are a snapshot, not a guarantee about later entrants; rerun the read-only impact query before release. A participant correction/support plan is required before the scoring transition.
- Prize total remains 175 lb (thirty 5 lb bags plus the 25 lb grand prize), pending Henry's business confirmation. Mandatory newsletter and YouTube comments remain in force.
- Saturday Bake Along bonus still requires an Academy activity. This may give paying members a points advantage; Henry's requirement that outside participants can enter free is preserved, but any free alternative/bonus policy needs a decision. No paid requirements were changed.
- The tracked partner email draft still has older wording about nobody winning twice; it was not sent or changed in this repair.
- Module One launch mismatch: the current seven-item mapping pairs the Module One/From Berries to Bread quiz (`m3`) with YouTube `smiOhsBluSY`, which the mapping audit identifies as the 4:35 series introduction. The actual Module One teaching-video URL is awaiting Henry. Preserve the ID and seven-lesson denominator until he supplies it; do not invent an eighth lesson or an unknown teaching URL.

## Verification and release order

Local Node validation matrix and inline script syntax pass. Isolated PostgreSQL 17 tests pass for blank/nonfinite/range/threshold inputs, 70 and 100 boundaries, decimals, historical fractions, preservation/correction of prior proof, eligibility totals, admin bypass prevention, bonus review behavior and RLS. `tests/draws.sql` tests 1/6/7-lesson pools, explicit flags (including a test-looking name with a false flag that remains eligible), deterministic/synthetic draws, the shared one-small-win rule, retained grand eligibility, published prize caps and the obsolete overload. Synthetic draw history is rolled back. `tests/test-flags.sql` verifies the exact two-row proposal and undo. Separate recovery proposal tests verify the code-only transition.

Playwright tests use intercepted synthetic fixtures and no real API calls. They pass at 393 CSS pixels for checkbox dimensions, entry-code sign-in, client rejection before RPC, passing submission, progress status and direct links; 393-pixel and 1440-pixel renders were inspected. The December small-prize option sends `final_small` plus `5 lb bag` to a mocked endpoint. Captures are local in `test-output/` and excluded from Git and deployment. External fonts/YouTube thumbnails were blocked in this isolated run, so this is layout/form QA, not third-party media playback verification.

To rerun frontend checks, use an explicit Node executable:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'tests\frontend.cjs'
$env:AGC_PLAYWRIGHT_PATH='<installed playwright-core package path>'
$env:AGC_CHROMIUM_PATH='<installed chrome.exe path>'
& 'C:\Program Files\nodejs\node.exe' 'tests\browser.cjs'
```

For backend tests, create a fresh **local disposable** PostgreSQL cluster/database; load `tests/baseline-schema.sql`, then `database/launch-validation.sql`, then `tests/backend.sql`, `tests/draws.sql` and `tests/test-flags.sql` with `psql -v ON_ERROR_STOP=1`. Fixtures contain only synthetic data. Never load the baseline schema or tests into production.

Rollback is concrete and separately reviewed: `database/rollback-launch-validation.sql` restores the inspected pre-fix functions/view and exact task-copy changes, leaves entrant/claim/proof data intact, and removes the added flag column. It checks hashes of the released functions/view, takes the draw advisory lock and refuses to run if draw history or true test flags exist. Undo approved test flags separately if authorized. The full rollback reopens the old validation/eligibility bugs and requires withdrawing/reverting the frontend, so it is an emergency retreat, not launch approval. Local rollback → reapply → full test cycle passes. Recovery PR #2 is not changed by this rollback.

Before any release: obtain parent authorization; review the separate recovery transition; refresh Git HEAD and database definitions; audit affected historical claims read-only; then apply the guarded validation SQL before releasing this frontend. Apply the separately approved recovery SQL before releasing its frontend change. SQL checks hashes of the inspected live functions/view and aborts atomically if another editor changed them. Do not bypass a guard without reinspecting. Changing the effective eligibility of incomplete historical claims requires a clear participant communication/support plan; no claim is deleted.

After release, verify the actual custom domain, direct RPC validation on an expressly authorized test fixture, returning-entry code access, phone controls, correct progress/leaderboard counts, preserved quiz/affiliate links and fresh database advisors. A merged PR or frontend deployment alone does not apply these Supabase SQL repairs.
