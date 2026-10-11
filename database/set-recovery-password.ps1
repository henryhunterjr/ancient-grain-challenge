# OWNER HELPER. Run only after approval/application of the reviewed migration.
# Credentials are entered personally at local masked prompts. No secret arguments.
[CmdletBinding(DefaultParameterSetName='Pooler')]
param(
  [Parameter(Mandatory=$true,ParameterSetName='Pooler')][ValidatePattern('^[a-z0-9-]+\.pooler\.supabase\.com$')][string]$PoolerHost,
  [Parameter(Mandatory=$true,ParameterSetName='Direct')][switch]$Direct,
  [string]$RootCertificate='',
  [ValidateRange(1,90)][int]$ValidDays=90,
  [string]$PsqlPath='C:\Program Files\PostgreSQL\17\bin\psql.exe'
)
$ErrorActionPreference='Stop'
if($PSCmdlet.ParameterSetName -eq 'Direct' -and -not $Direct){throw 'Use -Direct enabled to select the fixed project direct endpoint.'}
if(-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)){throw 'Install PostgreSQL client tools or supply the explicit psql executable path.'}
if($RootCertificate -eq 'system'){throw 'This Windows libpq cannot use sslrootcert=system. Use the bundled verified public Supabase CA or an explicitly verified public CA file.'}
if(-not $RootCertificate){
  $RootCertificate=Join-Path $PSScriptRoot 'certificates\prod-ca-2021.crt'
  # Public file downloaded from the official Supabase dashboard certificate URL.
  # Pin its reviewed PEM bytes; fail before asking for any private credentials.
  $expectedHash='700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7'
  # Use .NET directly: Get-FileHash is unavailable in some owner shell sessions.
  # This verifies the same SHA-256 pin without relying on cmdlet/module loading.
  $taskCAHasher=[System.Security.Cryptography.SHA256]::Create()
  $taskCAStream=$null
  try {
    $taskCAStream=[System.IO.File]::OpenRead($RootCertificate)
    $actualHash=[System.BitConverter]::ToString($taskCAHasher.ComputeHash($taskCAStream)).Replace('-','')
  } finally {
    if($taskCAStream){$taskCAStream.Dispose()}
    $taskCAHasher.Dispose()
  }
  if($actualHash -cne $expectedHash){throw 'Bundled public CA differs from its reviewed source. Stop and verify the certificate; do not weaken TLS.'}
}
$certPath=(Resolve-Path -LiteralPath $RootCertificate).Path.Replace('\','/')
if($certPath.Contains("'")){throw 'Use a public CA certificate file path without an apostrophe.'}
# The existing owner/admin password and new dedicated-role password are entered
# into psql's masked prompts, never command arguments, environment or this script.
# psql \password sends a SCRAM verifier rather than a raw password in ALTER ROLE.
$taskDatabaseHost=$PoolerHost
$taskDatabaseUser='postgres.pmhytaaajbhzyldmxmzb'
if($Direct){
  # Fixed to this project only. Direct connections bypass shared pooler auth.
  $taskDatabaseHost='db.pmhytaaajbhzyldmxmzb.supabase.co'
  $taskDatabaseUser='postgres'
}
$connection="host=$taskDatabaseHost port=5432 dbname=postgres user=$taskDatabaseUser sslmode=verify-full sslrootcert='$certPath' sslcertmode=disable ssl_min_protocol_version=TLSv1.2 connect_timeout=10 options='-c password_encryption=scram-sha-256'"
Write-Host ("Owner setup endpoint: "+$taskDatabaseHost+"; port 5432; user "+$taskDatabaseUser)
Write-Host 'Use your existing project-owner database password at the connection prompt.'
Write-Host 'At the role-password prompts, use a NEW unique random password of at least 32 characters from your password manager.'
Write-Host 'Save that same NEW dedicated-role password privately in Vercel as AGC_RECOVERY_DB_PASSWORD. Keep recovery disabled.'
$expiry=[DateTime]::UtcNow.AddDays($ValidDays).ToString('yyyy-MM-dd HH:mm:ss')+'+00'
& $PsqlPath -X -W -P pager=off -v ON_ERROR_STOP=1 -1 -d $connection -c '\password agc_entry_recovery_worker' -c "ALTER ROLE agc_entry_recovery_worker LOGIN VALID UNTIL '$expiry';"
if($LASTEXITCODE -ne 0){throw 'Password setup/activation was not confirmed. Keep recovery disabled and inspect the role metadata before retrying.'}
Write-Host "Dedicated recovery login activated; renew before $expiry. No entrant code or point was changed. This helper does not deploy or enable email recovery."
