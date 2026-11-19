<#
.SYNOPSIS
  Replays the PinPosy schema and SQL integration suite on a disposable local
  PostgreSQL database.

.DESCRIPTION
  This is the Windows counterpart of `scripts/verify.sh --migrations`, extended to
  also run the SQL integration files in CI order. It is designed to be run by the
  repository owner:

  * the database password is requested interactively and never stored on disk,
    printed, or committed;
  * only a loopback server is accepted;
  * a uniquely named disposable database is created and dropped in `finally`,
    and only that database is ever dropped;
  * the script never touches any other database on the server.

  It does not connect to production, PIN_TRIAL, or any existing application
  database: the disposable database is created fresh for this run.

  Before asking for a password it runs the static SQL checks that need no
  database (scripts/lib/sql-lexer.cjs), so a file whose dollar-quoted string lost
  one '$' is reported immediately instead of after a full schema replay.

  With -KeepGoing a failing SQL file does not stop the run: every file is
  attempted and all failures are listed at the end, so one run reveals the whole
  picture.

.EXAMPLE
  pwsh -File scripts/verify-sql-windows.ps1 -KeepGoing
  pwsh -File scripts/verify-sql-windows.ps1 -PostgresPort 5433 -SkipIntegration

.NOTES
  Exit code 0 means every migration and every SQL integration file applied
  cleanly. Any failure stops at the failing file and reports its name.
#>
param(
    [string]$PostgresHost = "127.0.0.1",
    [ValidateRange(1, 65535)]
    [int]$PostgresPort = 5432,
    [string]$PostgresUser = "postgres",
    [string]$PsqlPath = "psql",
    [switch]$SkipIntegration,
    [switch]$KeepDatabase,
    [switch]$KeepGoing,
    [switch]$Concurrency
)

# C:\Windows\System32\bash.exe is the WSL launcher, not a POSIX shell: on a machine
# without a WSL distribution it only exists to print 'Windows Subsystem for Linux
# has no installed distributions' and exits non-zero. It shadows Git Bash on PATH,
# so every candidate is smoke-tested before it is accepted.
function Find-Bash {
    $candidates = @(
        (Join-Path $env:ProgramFiles "Git\bin\bash.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Git\bin\bash.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Git\bin\bash.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\deepai-code-desktop\resources\git\bin\bash.exe")
    )
    $onPath = Get-Command bash -ErrorAction SilentlyContinue
    if ($onPath) { $candidates += $onPath.Source }

    foreach ($candidate in $candidates) {
        if (-not $candidate -or -not (Test-Path $candidate)) { continue }
        $directory = Split-Path $candidate -Parent
        if ($directory -like "*Windows\System32*" -or $directory -like "*Windows\SysWOW64*") { continue }

        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            $probe = @(& $candidate -c "echo PINPOSY_POSIX_SHELL_OK" 2>&1 | ForEach-Object { "$_" })
            $exitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        if ($exitCode -eq 0 -and (($probe -join "`n") -match "PINPOSY_POSIX_SHELL_OK")) {
            return $candidate
        }
        Write-Host "Skipping $candidate : not a usable POSIX shell." -ForegroundColor Yellow
    }
    return $null
}

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Migrated = 0
$TestsRun = 0
$DatabaseName = ""
$DatabaseCreated = $false
$SecurePassword = $null
$PlainPassword = $null

function Fail([string]$Message) {
    Write-Host ""
    Write-Host "FAIL: $Message" -ForegroundColor Red
    exit 1
}

function Invoke-Psql {
    param(
        [string]$Database,
        [string[]]$Arguments,
        [switch]$AllowFailure
    )

    $arguments = @(
        "-X", "-q",
        "-h", $PostgresHost,
        "-p", $PostgresPort,
        "-U", $PostgresUser,
        "-d", $Database,
        "-v", "ON_ERROR_STOP=1"
    ) + $Arguments

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        # Stringify every stderr record: a bare ErrorRecord would print as
        # 'System.Management.Automation.RemoteException' and hide the psql text.
        $output = @(& $PsqlPath @arguments 2>&1 | ForEach-Object { "$_" })
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        $output | ForEach-Object { Write-Host $_ }
        return $false
    }
    return @{ Ok = ($exitCode -eq 0); Output = $output }
}

function Invoke-Node {
    param([string[]]$Arguments)
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { return @{ Ok = $false; Output = @("node was not found; the static SQL check needs it") } }
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = @(& $node.Source @Arguments 2>&1 | ForEach-Object { "$_" })
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    return @{ Ok = ($exitCode -eq 0); Output = $output }
}

function Remove-DisposableDatabase {
    if (-not $DatabaseCreated) { return }
    Write-Host ""
    Write-Host "Dropping disposable database $DatabaseName" -ForegroundColor Cyan
    # Terminate leftovers, then drop only the database this script created.
    [void](Invoke-Psql -Database "postgres" -Arguments @(
        "-c", "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$DatabaseName'"
    ) -AllowFailure)
    $dropped = Invoke-Psql -Database "postgres" -Arguments @("-c", "drop database if exists `"$DatabaseName`"")
    if ($dropped.Ok) {
        $DatabaseCreated = $false
        Write-Host "Disposable database removed." -ForegroundColor Green
    }
    else {
        Write-Host "WARNING: could not remove $DatabaseName; remove it manually." -ForegroundColor Yellow
    }
}

try {
    # psql reports server messages in the console code page, which turns a
    # readable error into mojibake. Force UTF-8 end to end before anything runs.
    try {
        $utf8 = New-Object System.Text.UTF8Encoding($false)
        [Console]::OutputEncoding = $utf8
        [Console]::InputEncoding = $utf8
        $OutputEncoding = $utf8
        $env:PGCLIENTENCODING = "UTF8"
        if ($PSVersionTable.PSEdition -eq "Desktop") { [void](chcp 65001) }
    }
    catch {
        Write-Host "WARNING: could not switch the console to UTF-8; psql errors may look garbled." -ForegroundColor Yellow
    }

    Write-Host "PinPosy SQL gate" -ForegroundColor Cyan
    Write-Host "Repository: $Root"
    Write-Host "Server:     ${PostgresHost}:$PostgresPort (must be a local disposable instance)"
    Write-Host ""

    # ── Preconditions ────────────────────────────────────────────────────────
    if ($PostgresHost -notin @("127.0.0.1", "localhost", "::1")) {
        Fail "Refusing to run against a non-loopback host '$PostgresHost'. Use a disposable local server."
    }
    if (-not (Get-Command $PsqlPath -ErrorAction SilentlyContinue)) {
        Fail "psql was not found. Install the PostgreSQL client tools or pass -PsqlPath."
    }
    $baseline = Join-Path $Root "db/migrations/001_baseline.sql"
    $stubs = Join-Path $Root "db/supabase-stub.sql"
    if (-not (Test-Path $baseline)) { Fail "Missing canonical baseline db/migrations/001_baseline.sql" }
    if (-not (Test-Path $stubs)) { Fail "Missing Supabase stubs db/supabase-stub.sql" }

    # Active numbered migrations must be exactly the contiguous 010..163 chain.
    $migrations = Get-ChildItem (Join-Path $Root "db/migrations") -Filter "*.sql" |
        Where-Object { $_.Name -match '^\d{3}_' } |
        ForEach-Object {
            [pscustomobject]@{
                Number = [int]($_.Name.Substring(0, 3))
                Name   = $_.Name
                Path   = $_.FullName
            }
        } |
        Where-Object { $_.Number -ge 10 } |
        Sort-Object Number

    if ($migrations.Count -eq 0) { Fail "No active migrations found." }
    $expected = 10
    foreach ($migration in $migrations) {
        if ($migration.Number -ne $expected) {
            Fail "Migration chain is not contiguous at $($migration.Name): expected prefix $('{0:d3}' -f $expected)."
        }
        $expected += 1
    }
    Write-Host "Active migrations: $($migrations.Count) (010..$('{0:d3}' -f ($expected - 1)))"

    # ── Static pre-flight (no database, no password) ──────
    # Two defects cost a full schema replay before this check existed: a
    # dollar-quoted string that lost one '$' (unterminated at the end of the file)
    # and a mistyped PL/pgSQL variable. Both are detectable without a server, so
    # the owner is never asked for a password to discover them.
    $lexer = Join-Path $Root "scripts/lib/sql-lexer.cjs"
    $variables = Join-Path $Root "scripts/lib/sql-plpgsql-vars.cjs"
    if (-not (Test-Path $lexer)) { Fail "Missing scripts/lib/sql-lexer.cjs" }
    if (-not (Test-Path $variables)) { Fail "Missing scripts/lib/sql-plpgsql-vars.cjs" }
    $preflight = Invoke-Node -Arguments @(
        "-e",
        "const fs=require('fs'),path=require('path');" +
        "const {findUnbalancedDollarQuotes}=require(process.argv[1]);" +
        "const {findUndeclaredVariables}=require(process.argv[2]);" +
        "function walk(d,o=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){" +
        "if(e.name==='node_modules'||e.name==='.git')continue;const p=path.join(d,e.name);" +
        "if(e.isDirectory())walk(p,o);else if(e.name.endsWith('.sql'))o.push(p);}return o;}" +
        "const all=[...walk('db'),...walk('backend/test')];const tests=walk('backend/test');let bad=0;" +
        "for(const f of all){const prob=findUnbalancedDollarQuotes(fs.readFileSync(f,'utf8'));" +
        "if(prob.length){bad++;for(const m of prob)console.log('SQL_STATIC_FAIL '+f+': '+m);}}" +
        "for(const f of tests){for(const n of findUndeclaredVariables(fs.readFileSync(f,'utf8'))){" +
        "bad++;console.log('SQL_STATIC_FAIL '+f+': variable '+n+' is used but never declared');}}" +
        "console.log('SQL_STATIC_CHECKED '+all.length);process.exit(bad?1:0);",
        $lexer,
        $variables
    )
    $preflight.Output | ForEach-Object {
        if ($_ -match '^SQL_STATIC_FAIL ') { Write-Host $_ -ForegroundColor Red }
    }
    if (-not $preflight.Ok) {
        Fail "SQL files failed the static checks above. Fix them before touching a database."
    }
    # Count the corpus in PowerShell: the number is informational, and parsing it
    # out of the child's stdout depended on the pipeline shape.
    $sqlFileCount = @(Get-ChildItem -Path (Join-Path $Root "db") -Recurse -Filter "*.sql" -File).Count +
        @(Get-ChildItem -Path (Join-Path $Root "backend/test") -Recurse -Filter "*.sql" -File).Count
    Write-Host "Static SQL check OK ($sqlFileCount files)." -ForegroundColor Green

    # ── Credentials (interactive, never written anywhere) ────────────────────
    $SecurePassword = Read-Host -AsSecureString "Password for PostgreSQL user '$PostgresUser'"
    $credential = New-Object System.Management.Automation.PSCredential($PostgresUser, $SecurePassword)
    $PlainPassword = $credential.GetNetworkCredential().Password
    $env:PGPASSWORD = $PlainPassword

    $probe = Invoke-Psql -Database "postgres" -Arguments @("-tAc", "select current_setting('server_version')") -AllowFailure
    if (-not $probe.Ok) {
        Fail "Could not connect to ${PostgresHost}:$PostgresPort as '$PostgresUser'. Check the server, port and password."
    }
    $serverVersion = ($probe.Output | Where-Object { $_ -match '\d' } | Select-Object -First 1)
    Write-Host "Server version: $serverVersion"

    # ── Disposable database ──────────────────────────────────────────────────
    $suffix = [Guid]::NewGuid().ToString("N").Substring(0, 8)
    $DatabaseName = "pinposy_verify_$suffix"
    $created = Invoke-Psql -Database "postgres" -Arguments @("-c", "create database `"$DatabaseName`"")
    if (-not $created.Ok) { Fail "Could not create the disposable database $DatabaseName." }
    $DatabaseCreated = $true
    Write-Host "Created disposable database: $DatabaseName" -ForegroundColor Green

    # ── Schema replay ────────────────────────────────────────────────────────
    Write-Host ""
    Write-Host "Applying Supabase stubs" -ForegroundColor Cyan
    if (-not (Invoke-Psql -Database $DatabaseName -Arguments @("-f", $stubs)).Ok) {
        Fail "Supabase stubs failed (db/supabase-stub.sql)"
    }

    Write-Host "Applying 001_baseline.sql" -ForegroundColor Cyan
    if (-not (Invoke-Psql -Database $DatabaseName -Arguments @("-f", $baseline)).Ok) {
        Fail "Migration failed: 001_baseline.sql"
    }
    $Migrated = 1

    foreach ($migration in $migrations) {
        Write-Host ("  {0}" -f $migration.Name)
        # Migration 039 tightens privileges on Pinterest tables that migration 031
        # creates without grants; the CI fixture grants them first.
        if ($migration.Number -eq 39) {
            [void](Invoke-Psql -Database $DatabaseName -Arguments @(
                "-c", "grant all on public.pinterest_accounts, public.pinterest_publications to anon, authenticated"
            ))
        }
        if (-not (Invoke-Psql -Database $DatabaseName -Arguments @("-f", $migration.Path)).Ok) {
            Fail "Migration failed: $($migration.Name)"
        }
        $Migrated += 1
    }
    Write-Host "Schema replay OK: baseline + $($migrations.Count) migrations" -ForegroundColor Green

    if ($SkipIntegration) {
        Write-Host ""
        Write-Host "Skipping SQL integration files (-SkipIntegration)." -ForegroundColor Yellow
        return
    }

    # ── SQL integration files, in CI order ───────────────────────────────────
    $workflowPath = Join-Path $Root ".github/workflows/atomic-payment-integration.yml"
    if (-not (Test-Path $workflowPath)) { Fail "Missing .github/workflows/atomic-payment-integration.yml" }
    $workflowText = Get-Content $workflowPath -Raw
    $ordered = [System.Collections.Generic.List[string]]::new()
    foreach ($match in [regex]::Matches($workflowText, 'backend/test/([A-Za-z0-9._-]+\.sql)')) {
        $name = $match.Groups[1].Value
        if (-not $ordered.Contains($name)) { $ordered.Add($name) }
    }
    if ($ordered.Count -lt 40) {
        Fail "Only $($ordered.Count) SQL files were found in the CI workflow; refusing a partial suite."
    }
    # Files outside the atomic workflow (persisted-boards workflow and the schema
    # contract) still must pass against the same schema.
    foreach ($extra in @(
        "pinterest-failed-schedule-board-change-snapshot.integration.sql",
        "pinterest-scheduler-completion-fencing.integration.sql",
        "extended-sensitive-table-privileges.integration.sql",
        "auth-schema-contract.sql"
    )) {
        if ((Test-Path (Join-Path $Root "backend/test/$extra")) -and -not $ordered.Contains($extra)) {
            $ordered.Add($extra)
        }
    }

    Write-Host ""
    Write-Host "Running $($ordered.Count) SQL integration files" -ForegroundColor Cyan
    $failed = [System.Collections.Generic.List[string]]::new()
    foreach ($name in $ordered) {
        $path = Join-Path $Root "backend/test/$name"
        if (-not (Test-Path $path)) { Fail "CI references a missing SQL file: backend/test/$name" }
        Write-Host ("  {0}" -f $name)
        if (-not (Invoke-Psql -Database $DatabaseName -Arguments @("-f", $path)).Ok) {
            $failed.Add($name)
            if (-not $KeepGoing) {
                Fail "SQL integration file failed: backend/test/$name"
            }
            Write-Host ("  ^^ FAILED: {0} (continuing because -KeepGoing)" -f $name) -ForegroundColor Red
            continue
        }
        $TestsRun += 1
    }

    Write-Host ""
    if ($failed.Count -gt 0) {
        Write-Host "FAIL: $($failed.Count) SQL integration file(s) failed:" -ForegroundColor Red
        $failed | ForEach-Object { Write-Host "  backend/test/$_" -ForegroundColor Red }
        Write-Host "Passed: $TestsRun of $($ordered.Count)." -ForegroundColor Yellow
        exit 1
    }

    Write-Host "PASS: baseline + $Migrated migrations applied; $TestsRun SQL integration files passed." -ForegroundColor Green

    # ── Isolated concurrency tests (optional) ────────────────────────
    if ($Concurrency) {
        $bash = Find-Bash
        if (-not $bash) {
            Fail "-Concurrency needs bash. Install Git for Windows (Git Bash) or run without -Concurrency."
        }
        $runner = Join-Path $Root "backend/test/run-disposable-concurrency-suite.sh"
        if (-not (Test-Path $runner)) { Fail "Missing backend/test/run-disposable-concurrency-suite.sh" }
        # Read the list from the runner so the two can never drift apart.
        $concurrencyScripts = [System.Collections.Generic.List[string]]::new()
        foreach ($match in [regex]::Matches((Get-Content $runner -Raw), '(?m)^\s*([a-z0-9-]+\.sh)\s*$')) {
            if (-not $concurrencyScripts.Contains($match.Groups[1].Value)) {
                $concurrencyScripts.Add($match.Groups[1].Value)
            }
        }
        if ($concurrencyScripts.Count -lt 10) {
            Fail "Only $($concurrencyScripts.Count) concurrency scripts were found in the runner; refusing a partial suite."
        }

        # The shared preflight requires these variables and refuses anything that
        # is not an explicitly opted-in loopback disposable database.
        $env:PGHOST = $PostgresHost
        $env:PGPORT = [string]$PostgresPort
        $env:PGUSER = $PostgresUser
        $env:PGDATABASE = $DatabaseName
        $env:PINPOSY_ALLOW_DISPOSABLE_DB_TESTS = "1"

        Write-Host ""
        Write-Host "Running $($concurrencyScripts.Count) isolated concurrency tests against $DatabaseName" -ForegroundColor Cyan
        $concurrencyFailed = [System.Collections.Generic.List[string]]::new()
        foreach ($name in $concurrencyScripts) {
            Write-Host ("  {0}" -f $name)
            $previousErrorActionPreference = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            try {
                $output = @(& $bash "backend/test/$name" 2>&1 | ForEach-Object { "$_" })
                $exitCode = $LASTEXITCODE
            }
            finally {
                $ErrorActionPreference = $previousErrorActionPreference
            }
            if ($exitCode -ne 0) {
                $output | ForEach-Object { Write-Host $_ }
                $concurrencyFailed.Add($name)
                if (-not $KeepGoing) { Fail "Concurrency test failed: backend/test/$name" }
                Write-Host ("  ^^ FAILED: {0} (continuing because -KeepGoing)" -f $name) -ForegroundColor Red
            }
        }

        $env:PINPOSY_ALLOW_DISPOSABLE_DB_TESTS = $null
        Write-Host ""
        if ($concurrencyFailed.Count -gt 0) {
            Write-Host "FAIL: $($concurrencyFailed.Count) concurrency test(s) failed:" -ForegroundColor Red
            $concurrencyFailed | ForEach-Object { Write-Host "  backend/test/$_" -ForegroundColor Red }
            exit 1
        }
        Write-Host "PASS: $($concurrencyScripts.Count) isolated concurrency tests passed." -ForegroundColor Green
    }
}
catch {
    Write-Host ""
    Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
finally {
    if (-not $KeepDatabase) {
        Remove-DisposableDatabase
    }
    elseif ($DatabaseCreated) {
        Write-Host ""
        Write-Host "Keeping disposable database $DatabaseName (-KeepDatabase)." -ForegroundColor Yellow
    }
    # Clear the in-process credential copy.
    if ($PlainPassword) {
        $env:PGPASSWORD = $null
        Remove-Variable PlainPassword -ErrorAction SilentlyContinue
    }
    Remove-Variable SecurePassword -ErrorAction SilentlyContinue
}
