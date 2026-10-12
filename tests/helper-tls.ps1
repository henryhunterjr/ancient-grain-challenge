# Synthetic argument/guard checks only. Never invoke the real psql or read secrets.
$ErrorActionPreference='Stop'
# Reproduce the reported unavailable cmdlet without changing OS/module settings.
function Get-FileHash { throw 'This regression must not depend on Get-FileHash.' }
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
if($taskConnection.Contains('sslrootcert=system') -or -not ($taskArgs -contains '-W') -or -not ($taskArgs -contains '-1') -or -not ($taskArgs -contains 'pager=off')){throw 'Credential prompts/TLS/transaction/pager guard changed'}
if(-not $taskConnection.Contains('host=aws-0-us-east-1.pooler.supabase.com ') -or -not $taskConnection.Contains('user=postgres.pmhytaaajbhzyldmxmzb ')){throw 'Pooler identity changed'}
if(-not ($taskArgs -contains '\password agc_entry_recovery_worker')){throw 'SCRAM password command missing'}
if(-not ($taskArgs | Where-Object {$_ -match '^ALTER ROLE agc_entry_recovery_worker LOGIN VALID UNTIL '})){throw 'Scoped activation/expiry missing'}
$taskScopedCommands=@($taskArgs | Where-Object {$_ -eq '\password agc_entry_recovery_worker' -or $_ -match '^ALTER ROLE '})
& $taskHelper -Direct -PsqlPath $taskMock *> $null
$taskDirectArgs=$global:agcHelperTestArguments
$taskDirectConnection=$taskDirectArgs[([Array]::IndexOf($taskDirectArgs,'-d'))+1]
foreach($taskRequired in @('host=db.pmhytaaajbhzyldmxmzb.supabase.co ','user=postgres ','port=5432','dbname=postgres','sslmode=verify-full','ssl_min_protocol_version=TLSv1.2','password_encryption=scram-sha-256')){
  if(-not $taskDirectConnection.Contains($taskRequired)){throw "Missing direct connection parameter: $taskRequired"}
}
if($taskDirectConnection.Contains('pooler.supabase.com') -or $taskDirectConnection.Contains('user=postgres.')){throw 'Direct connection used pooler identity'}
if(-not ($taskDirectArgs -contains '-W') -or -not ($taskDirectArgs -contains '-1') -or -not ($taskDirectArgs -contains 'pager=off')){throw 'Direct prompts/atomic transaction/pager guard changed'}
$taskDirectCommands=@($taskDirectArgs | Where-Object {$_ -eq '\password agc_entry_recovery_worker' -or $_ -match '^ALTER ROLE '})
if($taskScopedCommands.Count -ne 2 -or $taskDirectCommands.Count -ne 2 -or $taskDirectCommands[0] -cne $taskScopedCommands[0]){throw 'Direct mode broadened the scoped worker commands'}
$taskExpiryMatch=[regex]::Match($taskDirectCommands[1],"^ALTER ROLE agc_entry_recovery_worker LOGIN VALID UNTIL '([^']+)';$")
if(-not $taskExpiryMatch.Success){throw 'Direct activation scope or expiry changed'}
$taskExpiry=[DateTimeOffset]::Parse($taskExpiryMatch.Groups[1].Value)
$taskDays=($taskExpiry.UtcDateTime-[DateTime]::UtcNow).TotalDays
if($taskDays -lt 89.99 -or $taskDays -gt 90){throw 'Direct expiry is not bounded to 90 days'}
$global:agcHelperTestArguments=$null
try { & $taskHelper -Direct:$false -PsqlPath $taskMock *> $null; throw 'Disabled direct switch should fail before psql' }
catch { if($_.Exception.Message -notlike '*Use -Direct enabled*'){throw} }
if($null -ne $global:agcHelperTestArguments){throw 'Disabled direct switch invoked psql'}
$global:agcHelperTestArguments=$null
try { & $taskHelper -Direct -ValidDays 91 -PsqlPath $taskMock *> $null; throw 'Expiry above 90 days should fail before psql' }
catch { if($_.Exception.Message -notlike '*greater than*90*'){throw} }
if($null -ne $global:agcHelperTestArguments){throw 'Excessive expiry invoked psql'}
$taskFailMock=Join-Path $taskOutput 'mock-psql-failure.ps1'
Set-Content -LiteralPath $taskFailMock -Encoding UTF8 -Value '$global:LASTEXITCODE=3'
try { & $taskHelper -Direct -PsqlPath $taskFailMock *> $null; throw 'Client failure should not report setup success' }
catch { if($_.Exception.Message -notlike '*Password setup/activation was not confirmed*'){throw} }
$global:agcHelperTestArguments=$null
try { & $taskHelper -PoolerHost 'aws-0-us-east-1.pooler.supabase.com' -RootCertificate 'system' -PsqlPath $taskMock *> $null; throw 'System store should fail before credential prompts' }
catch { if($_.Exception.Message -notlike '*cannot use sslrootcert=system*'){throw} }
if($null -ne $global:agcHelperTestArguments){throw 'Unsupported system trust invoked psql'}
$global:agcHelperTestArguments=$null
try { & $taskHelper -PoolerHost 'aws-0-us-east-1.pooler.supabase.com' -RootCertificate (Join-Path $taskOutput 'missing-public-ca.crt') -PsqlPath $taskMock *> $null; throw 'Missing certificate should fail before credential prompts' }
catch { if($_.Exception.Message -notlike '*does not exist*'){throw} }
if($null -ne $global:agcHelperTestArguments){throw 'Missing CA invoked psql'}
$taskTampered=Join-Path $taskOutput 'tampered-helper'
New-Item -ItemType Directory -Path (Join-Path $taskTampered 'certificates') -Force | Out-Null
$taskTamperedHelper=Join-Path $taskTampered 'set-recovery-password.ps1'
Copy-Item -LiteralPath $taskHelper -Destination $taskTamperedHelper -Force
Set-Content -LiteralPath (Join-Path $taskTampered 'certificates\prod-ca-2021.crt') -Encoding ASCII -Value 'Altered public CA fixture'
$global:agcHelperTestArguments=$null
try { & $taskTamperedHelper -PoolerHost 'aws-0-us-east-1.pooler.supabase.com' -PsqlPath $taskMock *> $null; throw 'Modified bundled CA should fail before credential prompts' }
catch { if($_.Exception.Message -notlike '*Bundled public CA differs*'){throw} }
if($null -ne $global:agcHelperTestArguments){throw 'Modified bundled CA invoked psql'}
Write-Output 'Pooler/direct identities, pager disabled, masked prompts, TLS, scoped atomic worker activation, 90-day expiry, and CA guards passed; real psql was never invoked.'
