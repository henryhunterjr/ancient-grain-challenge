# Owner setup for PR #7 recovery

The reviewed recovery migration was applied on 2026-10-09 as Supabase migration `20261009032317 / email_entry_recovery`. Do not apply it again. The dedicated worker still has no password and cannot log in. No new recovery code has been published and recovery remains disabled.

Henry has already saved the restricted Resend Sending key, `noreply@bakinggreatbread.com`, `AGC_RECOVERY_ENABLED=false`, and the actual `AGC_RECOVERY_DB_HOST=aws-0-us-east-1.pooler.supabase.com` in Production. Do not repeat these settings or retrieve their values. Do not use or alter Recipe Pantry's keys.

## Corrected private password command

The installed Windows PostgreSQL client reports 17rc1. Its `sslrootcert=system` path fails with `SSL error: unregistered scheme`, reproduced without any password. The helper now uses the reviewed public Supabase CA file and retains `sslmode=verify-full`, certificate and hostname verification, and a TLS 1.2 minimum. It changes no Windows trust settings.

Run this exact nonsecret command in Henry's local PowerShell:

```powershell
& 'C:\Users\henry\Documents\Codex\2026-10-07\task-3\registry-score-handoff\database\set-recovery-password.ps1' -PoolerHost 'aws-0-us-east-1.pooler.supabase.com'
```

Enter Henry's existing project-owner database password only at the masked connection prompt. At the next two masked prompts, enter a NEW unique random password of at least 32 characters from his password manager. No password belongs in chat, command arguments, Vercel's public Config values, or this repository.

The helper uses session-pooler port 5432 only for this short owner setup. PostgreSQL's `\password` sends a SCRAM verifier rather than cleartext password SQL. Password setup, worker LOGIN, and a maximum 90-day expiry commit in one transaction. The helper does not deploy or enable recovery. Record the expiry privately and rotate before it. On failure, keep recovery disabled; inspect nonsecret role metadata before retrying rather than assuming that a failed connection or uncertain commit rolled back.

If the existing owner password is unavailable, stop for an already authorized database owner to provision this dedicated role privately using their own existing access. Do not extract or reset existing credentials.

## Remaining Production configuration

In [the verified challenge Vercel environment settings](https://vercel.com/henryhunterjrs-projects/ancient-grain-challenge/settings/environment-variables), privately save Production-only:

- `AGC_RECOVERY_DB_PASSWORD`: that new dedicated-role password, Secret.
- `AGC_RECOVERY_RATE_PEPPER`: a separate new random secret of at least 32 characters, Secret.
- `AGC_RECOVERY_DB_CA`: the entire public PEM text from `database/certificates/prod-ca-2021.crt`, Config. For this actual pooler it is required: Node's built-in public roots reject the provider's private root CA. This is public certificate material, never a private key or password.

Keep `AGC_RECOVERY_ENABLED=false` and wait to redeploy. The runtime fixes port 6543, database postgres, and username `agc_entry_recovery_worker.pmhytaaajbhzyldmxmzb`; no connection URL, username setting, JWT or signing secret is required.

After private setup is confirmed, the existing owner approval covers live authentication/TLS/role verification, approved code deployment, controlled activation, and one recovery email to `henryhunterjr@gmail.com`. That mailbox matches one excluded test entry. Testing recovery must preserve its exclusion and existing code/points. No link or email has been created yet.

## What was verified

The public CA download URL was independently verified against the official Supabase dashboard source, then downloaded over verified HTTPS. The certificate was not trusted or copied from a failed database connection. [CA provenance and fingerprints](../database/certificates/README.md) record the exact source and reviewed identity. Its PEM bytes are pinned by the helper.

Credential-free Node probes verified the certificate chain and actual hostname on ports 5432 and 6543 with TLS 1.3. They sent only the PostgreSQL SSLRequest and TLS handshake; no startup, authentication or SQL. The actual installed psql client passed TLS on both ports and then stopped with `no password supplied` in a clean environment with an empty password file and password prompts disabled. Wrong hostname and unrelated CA were rejected. Mock helper argument/guard checks passed without invoking the real psql.

Successful live login, private password provisioning, the Vercel production build, and real email delivery remain unverified. Preserve certificate validation; never use `sslmode=require`, disable verification, install a new OS root, or trust a certificate obtained from a failed connection.

## Scoped changes and rollback

The applied migration creates only one private schema, two RLS tables, an expiry index, one private rate helper and three private recovery functions, plus the NOLOGIN/NOINHERIT worker. Only the three previously inherited PUBLIC EXECUTE grants on register, winners and admin_draw were removed; all explicit API grants and existing function bodies remain unchanged. No old migrations, entrant cleanup, subscription, public data updates or draws were performed.

Before any rollback, disable delivery and restore the preceding reviewed deployment. The reviewed `database/rollback-email-entry-recovery.sql` removes worker access/functions/role, restores those same three PUBLIC grants, and retains inaccessible private hash/counter storage. Use only under the applicable release or incident authorization.

For routine credential rotation, disable recovery, repeat the private helper with a new dedicated password, update only the password Secret, release under the existing applicable approval and confirm a fresh login. Existing sessions can survive password changes; the application retires its own connections after 60 seconds. For an approved incident response, `database/disable-email-recovery.sql` also revokes the three function grants and clears the dedicated password. Managed-pooler authentication/cache behavior still needs live verification.

Prior local evidence remains 16 API/transport/TLS tests, 24 Chrome regressions, and SQL security/rate/dedup/concurrency/rollback checks. This helper correction adds actual password-free pooler TLS tests and local helper guards; it does not change runtime application code or the applied migration.
