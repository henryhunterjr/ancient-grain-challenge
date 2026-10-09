# Synthetic argument/guard checks only. Never invoke the real psql or read secrets.
$ErrorActionPreference='Stop'
$taskRepo=Split-Path $PSScriptRoot -Parent
$taskOutput=Join-Path $taskRepo 'test-output\helper-tls'
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskMock=Join-Path $taskOutput 'mock-psql.ps1'
Set-Content -LiteralPath $taskMock -Encoding UTF8 -Value '$global:agcHelperTestArguments=@($args); $global:LASTEXITCODE=0'
$taskHelper=Join-Path $taskRepo 'database\set-recovery-password.ps1'
& $taskHelper -PoolerHost 'aws-0-us-east-1.pooler.supabase.com' -PsqlPath $taskMock *> $null
$taskArgs=$global:agcHelperTestArguments
$taskConnection=$taskArgs[([Array]::IndexOf($taskArgs,'-d'))+1]
foreach($taskRequired in @('sslmode=verify-full','ssl_min_protocol_version=TLSv1.2','sslcertmode=disable','connect_timeout=10','port=5432','password_encryption=scram-sha-256','certificates/prod-ca-2021.crt')){
  if(-not $taskConnection.Contains($taskRequired)){throw "Missing verified connection parameter: $taskRequired"}
}
if($taskConnection.Contains('sslrootcert=system') -or -not ($taskArgs -contains '-W') -or -not ($taskArgs -contains '-1')){throw 'Credential prompts/TLS/transaction guard changed'}
if(-not ($taskArgs -contains '\password agc_entry_recovery_worker')){throw 'SCRAM password command missing'}
if(-not ($taskArgs | Where-Object {$_ -match '^ALTER ROLE agc_entry_recovery_worker LOGIN VALID UNTIL '})){throw 'Scoped activation/expiry missing'}
$global:agcHelperTestArguments=$null
try { & $taskHelper -PoolerHost 'aws-0-us-east-1.pooler.supabase.com' -RootCertificate 'system' -PsqlPath $taskMock *> $null; throw 'System store should fail before credential prompts' }
catch { if($_.Exception.Message -notlike '*cannot use sslrootcert=system*'){throw} }
if($null -ne $global:agcHelperTestArguments){throw 'Unsupported system trust invoked psql'}
$global:agcHelperTestArguments=$null
try { & $taskHelper -PoolerHost 'aws-0-us-east-1.pooler.supabase.com' -RootCertificate (Join-Path $taskOutput 'missing-public-ca.crt') -PsqlPath $taskMock *> $null; throw 'Missing certificate should fail before credential prompts' }
catch { if($_.Exception.Message -notlike '*does not exist*'){throw} }
if($null -ne $global:agcHelperTestArguments){throw 'Missing CA invoked psql'}
Write-Output 'Helper TLS argument, masked-prompt, single-transaction, system-store and missing-CA guards passed; real psql was never invoked.'
