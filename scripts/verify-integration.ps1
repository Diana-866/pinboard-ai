[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$PostgresPort = 55439,
    [string]$PsqlPath = 'X:\Program Files\PostgreSQL\18\bin\psql.exe',
    [string]$ExpectedDataDirectory = 'X:\PinPosy-verify-pg18',
    [string]$DatabaseUser = 'pinposy_verify_admin'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$hostAddress = '127.0.0.1'
$createdDatabase = $null
$createdRoles = New-Object System.Collections.Generic.List[string]
$failure = $null
$oldEnvironment = @{}
$environmentNames = @('PGPASSWORD', 'PGHOST', 'PGPORT', 'PGUSER', 'PGDATABASE', 'PGCLIENTENCODING', 'PGCONNECT_TIMEOUT')
foreach ($name in $environmentNames) { $oldEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$passwordPointer = [IntPtr]::Zero
$securePassword = $null

function Invoke-Psql {
    param([string]$Database, [string[]]$PsqlArguments, [switch]$Capture)
    $arguments = @('-X', '-v', 'ON_ERROR_STOP=1', '-h', $hostAddress, '-p', [string]$PostgresPort, '-U', $DatabaseUser, '-d', $Database) + $PsqlArguments
    $output = @(& $PsqlPath @arguments 2>&1)
    $exitCode = $LASTEXITCODE
    $rendered = ($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
    if (-not $Capture) { foreach ($line in $output) { Write-Host $line } }
    if ($exitCode -ne 0) { throw "psql failed (exit $exitCode), database '$Database': $($rendered.Trim())" }
    if ($Capture) { return $rendered.Trim() }
}
function Get-PsqlValue {
    param([string]$Database, [string]$Sql)
    return Invoke-Psql -Database $Database -PsqlArguments @('-A', '-t', '-c', $Sql) -Capture
}
function Assert-PsqlTarget {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $PostgresPort -ErrorAction Stop)
    if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne $hostAddress) {
        throw ('Safety stop: expected exactly one listener on ' + $hostAddress + ':' + $PostgresPort + '; found ' + $listeners.Count + '.')
    }
    $processId = [int]$listeners[0].OwningProcess
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId"
    if ($null -eq $process -or $process.Name -ne 'postgres.exe') { throw 'Safety stop: listener is not owned by postgres.exe.' }
    $command = ([string]$process.CommandLine).Replace('\', '/').ToLowerInvariant()
    $expectedDirectory = $ExpectedDataDirectory.Replace('\', '/').TrimEnd('/').ToLowerInvariant()
    if (-not $command.Contains($expectedDirectory) -or $command -notmatch '(?i)-h\s+127\.0\.0\.1' -or
        $command -notmatch ('(?i)-p\s+' + [regex]::Escape([string]$PostgresPort))) {
        throw 'Safety stop: PostgreSQL process command line does not match the approved isolated cluster, loopback address and port.'
    }
    Write-Host ('Verified listener PID ' + $processId + ' and isolated data directory ' + $ExpectedDataDirectory + '.')
}
function Assert-RepositoryState {
    $branch = (& git -C $repoRoot branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') { throw "Safety stop: run only from clean main (current branch: '$branch')." }
    & git -C $repoRoot fetch origin main
    if ($LASTEXITCODE -ne 0) { throw 'Safety stop: could not fetch origin/main.' }
    $status = @(& git -C $repoRoot status --porcelain)
    if ($LASTEXITCODE -ne 0 -or $status.Count -ne 0) { throw 'Safety stop: local worktree is not clean.' }
    $head = (& git -C $repoRoot rev-parse HEAD).Trim()
    $remoteHead = (& git -C $repoRoot rev-parse origin/main).Trim()
    if ($LASTEXITCODE -ne 0 -or $head -ne $remoteHead) { throw "Safety stop: local main ($head) is not synchronized with origin/main ($remoteHead)." }
    Write-Host "Verified clean main checkout at $head."
}

try {
    Assert-RepositoryState
    if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) { throw "PostgreSQL client not found: $PsqlPath" }
    Assert-PsqlTarget
    $securePassword = Read-Host 'Введите пароль временной роли pinposy_verify_admin (ввод скрыт)' -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $env:PGHOST = $hostAddress
    $env:PGPORT = [string]$PostgresPort
    $env:PGUSER = $DatabaseUser
    $env:PGCLIENTENCODING = 'UTF8'
    $env:PGCONNECT_TIMEOUT = '5'

    $identitySql = "SELECT coalesce(inet_server_addr()::text, '') || '|' || inet_server_port() || '|' || current_setting('data_directory') || '|' || current_setting('server_encoding') || '|' || current_user || '|' || current_setting('server_version_num');"
    $identity = Get-PsqlValue -Database 'postgres' -Sql $identitySql
    $expectedPrefix = $hostAddress + '|' + $PostgresPort + '|' + $ExpectedDataDirectory.Replace('\','/') + '|WIN1251|' + $DatabaseUser + '|180'
    if (-not $identity.StartsWith($expectedPrefix)) { throw "Safety stop: PostgreSQL identity mismatch. Received: $identity" }
    Write-Host "Verified PostgreSQL identity: $identity"

    $roleRows = Get-PsqlValue -Database 'postgres' -Sql "SELECT rolname || '|' || rolsuper::text || '|' || rolcanlogin::text || '|' || rolbypassrls::text FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') ORDER BY rolname;"
    $roleMap = @{}
    foreach ($row in ($roleRows -split [Environment]::NewLine)) {
        $parts = $row.Trim() -split '\|'
        if ($parts.Count -eq 4) { $roleMap[$parts[0]] = $parts }
    }
    foreach ($roleName in @('anon', 'authenticated', 'service_role')) {
        if (-not $roleMap.ContainsKey($roleName)) {
            if ($roleName -eq 'service_role') { Invoke-Psql -Database 'postgres' -PsqlArguments @('-c', 'CREATE ROLE service_role NOLOGIN BYPASSRLS;') }
            else { Invoke-Psql -Database 'postgres' -PsqlArguments @('-c', "CREATE ROLE $roleName NOLOGIN;") }
            $createdRoles.Add($roleName)
        } else {
            $parts = $roleMap[$roleName]
            if ($parts[1] -ne 'false' -or $parts[2] -ne 'false' -or ($roleName -eq 'service_role' -and $parts[3] -ne 'true')) {
                throw "Safety stop: existing cluster role '$roleName' has unexpected attributes."
            }
        }
    }

    $fixturePath = Join-Path $repoRoot 'backend/test/postgres-integration-upgrade-fixture.sql'
    $deletionCheckPath = Join-Path $repoRoot 'backend/test/postgres-integration-pinterest-deletion-check.sql'
    $refreshCheckPath = Join-Path $repoRoot 'backend/test/postgres-integration-refresh-fence-check.sql'
    $manifestPath = Join-Path $repoRoot 'backend/test/postgres-integration-sql-manifest.txt'
    foreach ($path in @($fixturePath, $deletionCheckPath, $refreshCheckPath, $manifestPath)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required integration input missing: $path" }
    }
    $encoding = [Text.Encoding]::GetEncoding(1251, [Text.EncoderExceptionFallback]::new(), [Text.DecoderExceptionFallback]::new())
    $migrationDirectory = Join-Path $repoRoot 'db/migrations'
    $migrations = @(Get-ChildItem -LiteralPath $migrationDirectory -Filter '*.sql' -File |
        Where-Object { $_.Name -match '^(\d{3})_' -and [int]$Matches[1] -ge 10 -and [int]$Matches[1] -le 148 } |
        Sort-Object { [int]($_.Name.Substring(0, 3)) })
    if ($migrations.Count -ne 139) { throw "Safety stop: expected 139 active migrations 010-148; found $($migrations.Count)." }
    for ($i = 0; $i -lt 139; $i++) {
        if ([int]$migrations[$i].Name.Substring(0, 3) -ne ($i + 10)) { throw "Safety stop: migration sequence gap at $($i + 10)." }
    }
    $sqlTests = @(Get-Content -LiteralPath $manifestPath | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') })
    if ($sqlTests.Count -ne 46 -or ($sqlTests | Select-Object -Unique).Count -ne 46) { throw "Safety stop: expected 46 unique SQL tests; found $($sqlTests.Count)." }

    $sqlPaths = @($fixturePath, $deletionCheckPath, $refreshCheckPath) + @($sqlTests | ForEach-Object { Join-Path $repoRoot "backend/test/$_" })
    foreach ($path in $sqlPaths) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing SQL test file: $path" }
        [void]$encoding.GetBytes([IO.File]::ReadAllText($path, [Text.Encoding]::UTF8))
    }
    foreach ($migration in $migrations) { [void]$encoding.GetBytes([IO.File]::ReadAllText($migration.FullName, [Text.Encoding]::UTF8)) }

    $createdDatabase = 'pinposy_sqlint_' + ([Guid]::NewGuid().ToString('N')).Substring(0, 16)
    if ($createdDatabase -notmatch '^pinposy_sqlint_[a-f0-9]{16}$') { throw 'Internal database-name validation failed.' }
    $exists = Get-PsqlValue -Database 'postgres' -Sql "SELECT count(*) FROM pg_database WHERE datname = '$createdDatabase';"
    if ($exists -ne '0') { throw 'Safety stop: generated disposable database already exists.' }
    Write-Host "Creating disposable database $createdDatabase."
    Invoke-Psql -Database 'postgres' -PsqlArguments @('-c', ('CREATE DATABASE "' + $createdDatabase + '";'))
    if ((Get-PsqlValue -Database 'postgres' -Sql "SELECT count(*) FROM pg_database WHERE datname = '$createdDatabase';") -ne '1') {
        throw 'Disposable database creation could not be confirmed.'
    }

    Write-Host 'Applying CI legacy/upgrade fixture.'
    Invoke-Psql -Database $createdDatabase -PsqlArguments @('-f', $fixturePath)
    Write-Host 'Applying migrations 010-148 in numeric order.'
    foreach ($migration in $migrations) {
        if ($migration.Name.StartsWith('039_')) {
            Invoke-Psql -Database $createdDatabase -PsqlArguments @('-c', 'GRANT ALL ON public.pinterest_accounts, public.pinterest_publications TO anon, authenticated;')
        }
        Invoke-Psql -Database $createdDatabase -PsqlArguments @('-f', $migration.FullName)
    }
    Write-Host 'Running both inline CI assertions.'
    Invoke-Psql -Database $createdDatabase -PsqlArguments @('-f', $deletionCheckPath)
    Invoke-Psql -Database $createdDatabase -PsqlArguments @('-f', $refreshCheckPath)
    Write-Host "Running $($sqlTests.Count) ordered SQL integration tests."
    $index = 0
    foreach ($test in $sqlTests) {
        $index++
        Write-Host "[$index/$($sqlTests.Count)] $test"
        Invoke-Psql -Database $createdDatabase -PsqlArguments @('-f', (Join-Path $repoRoot "backend/test/$test"))
    }
    Write-Host 'PASS: upgrade fixture, migrations 010-148, two inline assertions and 46 SQL integration tests.'
    Write-Host 'NOT RUN: 9 Bash concurrency scripts; they require a separately validated Bash runtime.'
}
catch { $failure = $_ }
finally {
    if ($null -ne $createdDatabase) {
        try {
            Write-Host "Cleaning up only disposable database $createdDatabase."
            Invoke-Psql -Database 'postgres' -PsqlArguments @('-c', "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$createdDatabase' AND pid <> pg_backend_pid();")
            Invoke-Psql -Database 'postgres' -PsqlArguments @('-c', ('DROP DATABASE "' + $createdDatabase + '";'))
            Write-Host "Removed disposable database $createdDatabase."
        } catch { Write-Warning "Could not automatically remove disposable database '$createdDatabase': $_" }
    }
    foreach ($roleName in $createdRoles) {
        try { Invoke-Psql -Database 'postgres' -PsqlArguments @('-c', "DROP ROLE $roleName;") }
        catch { Write-Warning "Could not remove temporary role '$roleName': $_" }
    }
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $oldEnvironment[$name], 'Process') }
    if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
    if ($null -ne $securePassword) { $securePassword.Dispose() }
}
if ($null -ne $failure) { Write-Error "PostgreSQL integration runner failed: $failure"; exit 1 }
