# DRAFT OWNER HELPER. Run only after approval/application of the reviewed
# migration. This file has not been run against production. No secret arguments.
param(
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]+\.pooler\.supabase\.com$')][string]$PoolerHost,
  [string]$RootCertificate='system',
  [ValidateRange(1,90)][int]$ValidDays=90,
  [string]$PsqlPath='C:\Program Files\PostgreSQL\17\bin\psql.exe'
)
$ErrorActionPreference='Stop'
if(-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)){throw 'Install PostgreSQL client tools or supply the explicit psql executable path.'}
$certPath=if($RootCertificate -eq 'system'){'system'}else{(Resolve-Path -LiteralPath $RootCertificate).Path.Replace('\','/')}
if($certPath.Contains("'")){throw 'Use a public CA certificate file path without an apostrophe.'}
# The existing owner/admin password and new dedicated-role password are entered
# into psql's masked prompts, never command arguments, environment or this script.
# psql \password sends a SCRAM verifier rather than a raw password in ALTER ROLE.
$connection="host=$PoolerHost port=5432 dbname=postgres user=postgres.pmhytaaajbhzyldmxmzb sslmode=verify-full sslrootcert='$certPath' options='-c password_encryption=scram-sha-256'"
Write-Host 'Use your existing project-owner database password at the connection prompt.'
Write-Host 'At the role-password prompts, use a NEW unique random password of at least 32 characters from your password manager.'
Write-Host 'Save that same NEW dedicated-role password privately in Vercel as AGC_RECOVERY_DB_PASSWORD. Keep recovery disabled.'
$expiry=[DateTime]::UtcNow.AddDays($ValidDays).ToString('yyyy-MM-dd HH:mm:ss')+'+00'
& $PsqlPath -X -W -v ON_ERROR_STOP=1 -1 -d $connection -c '\password agc_entry_recovery_worker' -c "ALTER ROLE agc_entry_recovery_worker LOGIN VALID UNTIL '$expiry';"
if($LASTEXITCODE -ne 0){throw 'Password setup/activation failed. The helper transaction was rolled back. Keep recovery disabled.'}
Write-Host "Dedicated recovery login activated; renew before $expiry. No entrant code or point was changed. This helper does not deploy or enable email recovery."
