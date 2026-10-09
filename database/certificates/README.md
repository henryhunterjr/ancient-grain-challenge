# Supabase public database CA

`prod-ca-2021.crt` contains a public CA certificate, not a credential or private key. It is used explicitly by the local provisioning helper; nothing is installed into the Windows trust store.

Downloaded over verified HTTPS on 2026-10-09 from:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

The URL was verified against Supabase's official dashboard source:

https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json

`ssl:certificate_url` expands to this URL with `env=prod`. The dashboard SSLConfiguration component uses that value for its Download certificate button. Supabase's official PSQL guide documents using this certificate with `sslmode=verify-full`:

https://supabase.com/docs/guides/database/psql

Identity: Supabase Root 2021 CA, issued by itself; valid through 2031-04-26.

- DER certificate SHA-256: `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`
- Downloaded PEM file SHA-256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`

The PEM hash is pinned by the helper. Obtain and review any replacement from an official source; never derive a trusted root from a failed connection.

On the owner-confirmed `aws-0-us-east-1.pooler.supabase.com`, credential-free Node TLS probes passed with certificate/hostname verification, TLS 1.3, and this CA on ports 5432 and 6543. The installed Windows PostgreSQL 17rc1 client reproduced `unregistered scheme` with `sslrootcert=system`; with this file it passed TLS and stopped because no password was supplied. Incorrect hostname and unrelated certificate were rejected. These probes performed no successful database authentication or SQL.

For this pooler, the Vercel application also requires the **full public PEM text** as Production Config `AGC_RECOVERY_DB_CA`. This file is not deployed (`database/` is excluded). This setting is public certificate material, not a password or private key. The server already supports it while retaining `rejectUnauthorized=true`, hostname verification, and a TLS 1.2 minimum. Keep recovery disabled until private setup and live login checks are complete.
