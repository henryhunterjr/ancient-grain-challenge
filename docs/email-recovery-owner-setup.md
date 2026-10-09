# Owner setup for draft PR #7

**Not approved for publication yet. No production login/password, migration, grant change, auth change or deployment has been performed by this draft.**

Henry has already saved the new restricted Resend Sending key, `noreply@bakinggreatbread.com`, and `AGC_RECOVERY_ENABLED=false` in Production. Do not repeat these settings or retrieve their values. Do not use or alter Recipe Pantry's keys.

## Next safe step: public connection metadata only

1. Open [the challenge's Supabase project](https://supabase.com/dashboard/project/pmhytaaajbhzyldmxmzb).
2. Choose **Connect → Transaction pooler**. Copy only its hostname ending in `.pooler.supabase.com`; use the actual Connect value, not a guessed region hostname. No password or complete connection URL goes into chat.
3. Open [the verified challenge Vercel project → Environment Variables](https://vercel.com/henryhunterjrs-projects/ancient-grain-challenge/settings/environment-variables). Save the hostname as **Production only**, Config, `AGC_RECOVERY_DB_HOST`. Keep ENABLED=false and do not redeploy.

The application fixes the pooler port to 6543, database to postgres, and login username to `agc_entry_recovery_worker.pmhytaaajbhzyldmxmzb`. There is no username or connection URL to enter, and no custom JWT or signing secret is required.

## After explicit approval of the revised release

1. Apply only `supabase/migrations/20261008211000_email_entry_recovery.sql` after its guards/ACLs are reviewed. It leaves the worker NOLOGIN with no password. No old migration or entrant cleanup is repeated.
2. Generate a **new unique random password, at least 32 characters**, in Henry's password manager. Provision it privately with the reviewed local helper below. This requires Henry's existing project-owner database password at a masked local prompt; that broad credential is never put into Vercel, chat, command arguments or this app. If Henry cannot authenticate as owner, stop for an authorized provisioning method; do not reset or extract existing credentials.
3. In the same Vercel project, save that new dedicated password as **Production Secret** `AGC_RECOVERY_DB_PASSWORD`. Generate a separate random secret of at least 32 characters in the password manager and save it as **Production Secret** `AGC_RECOVERY_RATE_PEPPER`. Keep ENABLED=false. The existing Resend key remains unchanged.
4. Deploy only the exact approved commit, confirm TLS and fresh authentication through the actual transaction pooler, inspect role/function grants, and perform the separately authorized owner-email test. Enable recovery only under that release approval. These live checks have not been performed by the draft.

The optional Config `AGC_RECOVERY_DB_CA` accepts a **public trusted CA PEM** if Node's default CA roots cannot verify the pooler. Do not supply a private key or disable certificate/hostname verification. Confirm an appropriate root from Supabase or a trusted CA authority; do not blindly trust a certificate presented by a failed/unverified connection. Check shared Resend tracking and log drains privately; if shared settings need changing, review their effect on Recipe Pantry first.

## Private provisioning and rotation helper

The Windows machine already has PostgreSQL 17 client tools. Run the reviewed helper manually in a local PowerShell terminal only after approval. Its arguments contain no secrets:

```powershell
& .\database\set-recovery-password.ps1 -PoolerHost '<actual-host-from-Connect>'
```

Replace the hostname placeholder with the public host; never type angle brackets literally. The helper uses session-pooler port 5432 for the short owner setup, `sslmode=verify-full`, system CA roots and SCRAM. After the masked owner connection prompt, PostgreSQL's `\password` command prompts twice for the new role password and encrypts it before sending the ALTER ROLE statement, avoiding cleartext password history/logs. Password setup, worker LOGIN and the 90-day expiry are committed together in one transaction. It does not deploy or enable email recovery. Record that expiry privately and rotate before it.

If system CA trust is unavailable, stop and obtain a trusted **public** root CA file appropriate for the actual pooler, then use `-RootCertificate 'C:/path/to/verified-public-root.pem'`. Do not weaken TLS. This interactive helper was parsed/reviewed but not exercised with production credentials.

For routine rotation: keep recovery disabled, repeat the helper using a new dedicated password, update only `AGC_RECOVERY_DB_PASSWORD`, release under owner approval and confirm a fresh connection before enabling. Existing authenticated sessions can survive a password change. The application retires its own connections after 60 seconds, but live pooler authentication/cache behavior remains a required owner check. For suspected compromise, after approval use `database/disable-email-recovery.sql`: it disables login, clears the dedicated password and revokes the three function grants, blocking even an established session. Restore those grants only after incident review and credential replacement.

## Exact bounded production changes requiring approval

- Create one private schema, two private RLS-enabled tables, an expiry index, one private rate helper and three private recovery functions.
- Create one NOLOGIN/NOINHERIT role with no password, no superuser/role/database creation, replication or RLS bypass; grant only recovery-schema USAGE and execution of those three recovery functions. No authenticator membership, public table grants or Supabase Auth changes.
- Remove only the existing **PUBLIC EXECUTE** grant from `public.register(text,text,text,text,text,text,text,boolean,boolean,text)`, `public.winners()` and `public.admin_draw(text,text,text,text)`. Their existing explicit anon/authenticated/service_role/owner grants remain intact. Their code and behavior are unchanged. Migration guards abort if this metadata snapshot has drifted.
- Owner privately sets a new dedicated-role password, LOGIN and a maximum 90-day expiry; enters host/password/pepper privately in this project's Production environment; approves the exact code deployment and controlled activation/test.

Rollback first disables delivery and restores the preceding reviewed deployment, then applies `database/rollback-email-entry-recovery.sql`. It removes worker access/functions/role, restores the same three PUBLIC grants, and retains inaccessible private hash/counter storage. Original entry codes, entrants, scores, claims, points, admin passcode and drawing behavior are unchanged. Role provisioning and migration do not subscribe anyone or send email.

Local evidence: 6 API tests, 5 transport tests, 5 real local TLS/SCRAM tests and 24 Chrome regressions passed, plus SQL security/rates/dedup/concurrency/rollback tests. Managed pooler login, real sender delivery and the production Vercel API build remain unverified until the separately approved live setup.
