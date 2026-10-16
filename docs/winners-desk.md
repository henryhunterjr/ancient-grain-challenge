# Winners desk (October 16, 2026)

Adds prize fulfillment to the Host Desk without touching how draws work.

## What's new

- `winner_fulfillment` table: one row per draw, created by a trigger on `draws`, seeded with the baker's registration grain. Holds status, shipping details, phone, tracking, notes, and timestamps for each step. RLS on, no anon or authenticated access; everything goes through the RPCs below.
- Admin RPCs (passcode gated like the rest): `admin_winners`, `admin_winner_mark`, `admin_winner_edit`, `admin_set_draw_label`.
- Public RPCs for the claim page, keyed by an unguessable claim token: `winner_claim`, `winner_claim_submit`. The view returns first name and prize only, never email. Submissions lock once the batch goes to Grand Teton.
- `/claim?c=<token>`: the page a winner opens from their email. Confirms grain, collects address and phone. `noindex`, `no-store`.
- Host Desk sections: Winners and prizes, Send the shipment list to Grand Teton, Announce the winners, Keep bakers moving. All email goes out as pre-filled Gmail drafts (mailto); nothing sends on its own.
- Draw labels default to `Week N · <date>` or `Finale · Dec 1` from the draw date. A one-click fix fills in labels that were left blank.

## Friday routine

1. Draw four winners. Labels fill in on their own.
2. For each winner: Open winner email, send it, Mark notified. The email carries the claim link and the 7 day deadline.
3. Copy the Skool and Facebook posts from Announce the winners, post them, Mark announced. Paste the newsletter block into the Recipe Pantry newsletter.
4. From Keep bakers moving, send nudges to stalled bakers, or copy the blast into the newsletter.
5. As addresses arrive, winners move to Ready for Grand Teton. Download the CSV, Open email to Grand Teton, attach the CSV, send, Mark batch sent.
6. When Adam confirms shipping, add tracking under Edit details, Open shipped email, Mark shipped.
7. No address after 7 days: send one reminder. Still nothing: Forfeit, and draw one more.

## Release

Apply `supabase/migrations/20261016150000_winner_fulfillment.sql` to production through the migration tool, then merge and deploy. The migration is re-runnable. Local proof: `python3 tests/run-winners.py` (disposable PostgreSQL) and `npx playwright test tests/winners-desk.spec.js` (mocked RPCs, no network).

Rollback: `drop function` the six new functions, `drop trigger draws_fulfillment on draws`, `drop function _fulfillment_for_draw`, `drop table winner_fulfillment`. Draws and entrants are untouched by any of it.
