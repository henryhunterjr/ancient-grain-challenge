# NutriMill mixer addition — October 17, 2026

The Bosch Universal Plus stand mixer is an additional December 1 prize. Every registered, non-disqualified, non-test baker receives one entry plus their verified points. No lesson is required. Grain prizes, lesson thresholds, point values, and the one-small-bag limit retain their existing behavior. A grain winner can also win the mixer.

## Included

- Supplied wide graphic at `/img/mixer-giveaway.jpg` (the exact URL used in the email drafts), plus the supplied tall social image at `/img/mixer-giveaway-tall.jpg`.
- Hero prize card, registration explanation, official rules, winners labels, and clarification of the separate grain/mixer qualification paths. The existing registration promo and Henry's Register free jump destination are retained, along with NutriMill's existing partner card and affiliate link.
- A separate `mixer` option in the Host Desk. It uses `admin_draw`, the existing administrator gate, and the existing draw lock. One active mixer winner is allowed. Forfeiting an unclaimed mixer permits a replacement draw for another baker, preserving the original draw and fulfillment history. Previous mixer winners do not re-enter the mixer pool.
- Mixer-specific claim form and winner/reminder/shipping messages. The mixer requires a shipping address, without a grain selection. Claim token privacy and shipment locks are retained.
- Partner selection keeps NutriMill's mixer shipment separate from Grand Teton's grain shipments, including both batch and full-history CSV exports. Each partner has its own locally remembered email address. These controls prepare messages; they do not send them.

## Release order (Henry reviews and merges)

1. Review the PR. Confirm the existing launch-validation schema and winner fulfillment migration (`20261016150000_winner_fulfillment.sql`) are installed.
2. Apply `supabase/migrations/20261017230000_nutrimill_mixer.sql` through the authorized database release process before releasing the frontend. It is transactional and re-runnable, replaces four functions, and does not modify existing entrants, points, or draws. Keep the migration when rolling back the frontend; dropping tables or draw history is unnecessary.
3. Merge and deploy the frontend after the database change succeeds.
4. Verify the exact public JPEG URL returns 200, the supplied graphic renders without cropping on mobile and desktop, the mixer rules appear, and the Host Desk offers the mixer option. Do not run a production draw during verification; the scheduled mixer draw is December 1, 2026.
5. Review the 77 registrant thank-you drafts against current entrant and delivery records separately. This PR neither imports that private recipient list nor sends emails. The copy's mixer claim becomes deploy-verified only after the preceding steps.

## Validation

`npm test` covers the existing registration, private-code, lesson score, and grain fulfillment flows, plus mixer selection, its claim form, partner separation, announcement copy, and mobile/desktop image layout. Supabase requests are mocked and external browser requests are blocked.

`PG_BIN=<local PostgreSQL bin> python tests/run-winners.py` uses a disposable localhost-only PostgreSQL database. It checks the unchanged grain pools/caps, mixer weights and exclusions, grain-winner eligibility, nonempty grain pools before/after a mixer draw, mixer claim submission/locks, forfeiture replacement, repeatable migrations, and concurrent requests admitting exactly one mixer winner. All fixture identities are synthetic.

Production migration and rendering remain release checks; local passing tests do not establish that the new drawing is live.
