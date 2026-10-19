# Email sign-in links

People who registered can get a one-tap sign-in link by email instead of pasting their entry code.
The form appears on Record your score (signed out), each lesson page (guest view), and the home page under "Already registered? Sign in".

## How it works
1. The browser posts `{action:"request", email, quiz?, next?}` to the Supabase Edge Function `entry-signin`.
2. The function calls `agc_entry_recovery.entry_recovery_issue` (rate limits: 100/hour overall, 10 per 15 min per IP, 3/hour and 60 s apart per email). If exactly one entrant has that email, it emails a link through Resend.
3. Every request gets the same message after the same 3-second delay, so the form never reveals who registered.
4. The link is `https://challenge.bakinggreatbread.com/recover-entry#r=<credential>[&quiz=..&score=..&total=..][&next=mN]`. Only a hash of the credential is stored. It works once and expires in 60 minutes.
5. On `/recover-entry` the person taps "Sign me in" (email scanners that only load the page never use up the link). The function calls `entry_recovery_redeem`, the browser stores the entry code, keeps any carried quiz score as the pending result, and forwards to `/record-score` (or the lesson, or Your entry).

## Setup
- Edge Function: `supabase/functions/entry-signin` (deploy with JWT verification off; the function checks the Origin itself).
- Secret `AGC_RESEND_KEY`: a Resend API key with sending access for bakinggreatbread.com. Set it in Supabase under Edge Functions, Secrets.
- Optional secrets: `AGC_FROM` (default `Ancient Grain Challenge <noreply@bakinggreatbread.com>`), `AGC_RECOVERY_PEPPER` (defaults to the project service key), `AGC_SIGNIN_ENABLED=false` to switch it off.
- Migration `20261019120000_signin_link_60min.sql` sets the 60-minute link lifetime.

## Tests
- `node --experimental-strip-types --test tests/entry-signin.test.mjs` (function logic)
- `tests/email-signin.spec.js` (browser flow, mocked network)
