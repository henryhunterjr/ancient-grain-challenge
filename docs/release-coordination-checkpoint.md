# October 8 publication checkpoint

## Resolved and applied at 07:31 UTC

The original task is independently confirmed idle/completed. A fresh read-only outcome check after the interrupted call confirmed no release changes had committed. All original hashes and the sixteen-claim snapshot still matched. The corrected exact-UTF-8 release bundle was applied as migration `20261008073145 approved_challenge_release_with_muse_score` and verified: eleven private originals, eleven rejected claims with original content intact, exactly two designated tests, recovery execution revoked, three score RPCs installed, five entrants/sixteen claims unchanged and zero draws. Score/comment/best-retake/ownership smoke checks passed transactionally on the existing designated test and were rolled back, leaving zero result rows. PR #1 merged at `efc0bf23ff4d1a73cd57ebf3f0f1c30b5bdc3105`, PR #2 at `ec1ffdbf881cfe167aa5ebce3d1ed6205ac614c1`. Frontend deployment evidence belongs in the final release handoff.

## Historical pre-release checkpoint

Henry approved publication of the prerequisites and Muse score connection. The release owner is this isolated checkout and branch. Other checkouts and repair branches remain untouched.

Before any production mutation, read-only reconciliation found:

- Current production deployment `dpl_2LFT5TSTstcjMd52Ye5UVPpy3LDW`, READY, aliases including `challenge.bakinggreatbread.com`, commit `4b6b506972aac7744bc8becd7228c55772a44303`.
- Remote main remains `4b6b506`; PR #1 head `d830485`; PR #2 head `33c9ef9`; initial PR #3 head `5ae37dc`.
- No other active database transaction/operation or relevant lock was visible in `pg_stat_activity` / `pg_locks`.
- The inspected original function/view hashes match every prerequisite snapshot guard. Only original migration `20261004193046 challenge_schema` is recorded.
- No `entrants.is_test`, cleanup archive or `quiz_results` table exists. Thus the interrupted prior migration did not commit these changes.
- Five entrants, sixteen claims, twelve verified module claims, zero draws. Both explicitly approved test IDs still have their inspected names and are not disqualified. Claim snapshot checksum is `ad29620f1cd2fbb875970a7fe62a7a90`.

The original task `01a11819-0fba-712f-a6bf-f1ee04d100f0` still reports `inProgress`. Every visible recorded tool call is completed, but there is no visible acknowledgment that the stop instruction was received/completed. A later resumed task could deploy an older commit. Current absence of a database transaction does not establish a stopped release owner.

**Production mutation/merge/deploy is paused until the original task is confirmed stopped/idle or a reliable mechanism prevents its further deployments.** The parent-message attempt using the source thread ID (with and without durable host routing) returned `thread not found`; the checkpoint is also present in this task's commentary and final response. No permission denial occurred.

The isolated branch includes Henry's exact registration-first copy in the hero, how-it-works and signup section, the requested 30-winner wording, and the unchanged original videos/seven IDs. `m3` is already first in the live task ordering. Existing comments, newsletter requirements and published prize/rule conditions remain intact.

`tests/build-approved-release.py` generates a review-only SQL bundle in `test-output/approved-release-bundle.sql`. It wraps all five approved steps in one transaction, acquires release/draw locks and table locks, uses five-second lock and 45-second statement limits, pins the sixteen-claim checksum, and retains all original schema/function, exact-two-test and exact-eleven-cleanup guards. An already-applied or changed state fails closed; do not repeat an ambiguous call without inspecting its result. The original stale migration guards would reject an already-applied release, but SQL guards cannot prevent a separate old Vercel deployment.

When coordination clears: refresh the read-only snapshots, apply the guarded bundle via the migration tool, inspect archive eleven rows and two flags/recovery permissions/score endpoint state, merge PR #1 with its exact reviewed head, retarget and merge PR #2 with its exact head, then retarget PR #3 to main and merge its final reviewed head. Confirm the actual production deployment SHA before live tests. Do not create subscriptions or real entrants, or execute a real draw. Verify backend writes transactionally on an existing designated test with rollback, and verify public receiving/signup/recovery UI without submitting a real signup.

Muse must still add seven results buttons and test outward navigation from its sandbox. The planned production receiving URL is not an activation guarantee while publication is paused.

Final combined checks passed: 13 isolated integration browser cases including the exact hero/signup/how-it-works copy; prior frontend syntax/percentage/quiz-link tests; PostgreSQL score/ownership/cutoff/concurrent-save tests and integration rollback; separate synthetic prerequisite tests for exact test flags, eleven-claim archive/restoration and prize pools. The combined bundle was additionally executed against synthetic local fixtures with only snapshot hashes substituted in memory: injected final-step failure rolled back all five steps, success archived eleven originals and flagged two tests, and replay was rejected with no further change. No production bundle was applied. Local draw tests use synthetic data and roll back; no real draw occurs.
