# Weekly outreach and compact Host Desk

The Host Desk keeps growing rosters closed until Henry needs them. Entrants, activity reviews, winners, shipments, announcements, personal nudges and newsletter copy have compact headings. Entrants and nudges have search; long records scroll within their section.

Weekly emails retain the mixer artwork and existing sign-in flow. Their opening rotates weekly by progress stage. A dated editorial note, recipe and bake-along can be saved for a seven-day window. After that, they are omitted automatically. Completed lessons with recorded scores, the next lesson's best score, earned mixer entries and the latest saved grain winners come from the database. No shipping claim is inferred. Finished bakers get a next-bake invitation and open bonus activities, rather than another beginner introduction.

## Academy CSV

Export **active Academy members** with email addresses. In Weekly outreach, open Academy member snapshot, choose the CSV, review match totals, confirm it contains active members, and replace the snapshot. Only normalized, deduplicated email addresses and the import timestamp are retained, in a private RLS-enabled table. Names cannot establish membership. Invalid rows block the entire replacement. A missing match is labeled not matched, rather than non-member. After 14 days without refresh, membership becomes unknown. Import weekly; no scheduler or automatic Academy download is claimed.

Admin filters separate matched members, unmatched emails and unknown status. Emails welcome members back; unmatched bakers receive a conditional Academy invitation; unknown bakers get a neutral invitation.

## Discovery and MEW

New registration includes an optional “How did you first hear about this challenge?” question. First-touch source plus allowlisted UTM fields are recorded after a successful registration. A failed attribution request does not block the entry. Earlier entrants are not backfilled with guessed sources. Host Desk summarizes recorded answers.

Five copyable MEW drafts cover Monday lesson progress, Wednesday recipe practice, Thursday's drawing reminder, the latest winners and Saturday's community/bake-along invitation. Review each before queueing. No MEW integration, recurring schedule, publication or outbound email is created by this release.

## Release order

1. Inspect live schema against the fixture and current migration history. This session's Supabase connection returned permission denied, so live schema compatibility has not been verified and none of this release was applied to production.
2. Apply `supabase/migrations/20261025053221_weekly_outreach.sql`. It adds private tables and guarded RPCs; existing entrants, claims, draws, scores and email history are untouched. Current admin passcode checks protect Host Desk RPCs. Private email and score functions are revoked from public roles.
3. Deploy both files in `supabase/functions/progress-mail/`, preserving existing environment secrets, origin checks and passcode authentication. The sender now requires `progress_mail_list_v3()`.
4. Deploy the web assets from this commit. Never deploy the sender before the migration. If the database update is absent, the Host Desk reports shared settings unavailable and treats membership as unknown.
5. Import the active Academy CSV, save this week's editorial note, recipe and bake-along, and use **Review weekly messages**. This generates real message variants without issuing sign-in tokens, sending emails or changing contact history. The existing inbox preview sends only to Henry's configured preview accounts when explicitly requested.
6. Verify one zero-progress, comment-pending, in-progress and completed baker; current winners and dates; member/unmatched invitations; expired editorial copy; source capture; mobile collapse/search; and existing fulfillment actions. Do not send the batch while validating.

## Local checks

`npm ci`

`node --experimental-strip-types --test tests/progress-mail.test.mjs tests/campaign.test.cjs tests/outreach-db.test.mjs`

`npx playwright install chromium`

`npx playwright test`

Database tests run actual PostgreSQL semantics in disposable PGlite storage with synthetic data. Browser tests mock outbound services. No production requests, emails, draws, addresses or points are created by tests.
