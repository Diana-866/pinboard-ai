param(
    [switch]$SkipInstall,
    [switch]$Migrations,
    [switch]$MigrationsOnly,
    [ValidateRange(1, 65535)]
    [int]$PostgresPort = 5432
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Failed = $false
$Summary = New-Object System.Collections.Generic.List[string]

function Invoke-Step {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string]$Command,
        [string[]]$Arguments
    )

    Write-Host ""
    Write-Host ("> " + $Name) -ForegroundColor Cyan
    Push-Location $WorkingDirectory
    try {
        & $Command @Arguments
        $exitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($exitCode -eq 0) {
        $Summary.Add("PASS  $Name")
        return $true
    }

    $Summary.Add("FAIL  $Name (exit $exitCode)")
    $script:Failed = $true
    return $false
}

function Ensure-Dependencies {
    param([string]$Directory, [bool]$HasLockFile)

    if (Test-Path (Join-Path $Directory "node_modules")) {
        return $true
    }

    if ($SkipInstall) {
        Write-Host "node_modules is missing and -SkipInstall was specified." -ForegroundColor Red
        $script:Failed = $true
        return $false
    }

    if ($HasLockFile -and (Test-Path (Join-Path $Directory "package-lock.json"))) {
        return (Invoke-Step -Name "Install dependencies: $(Split-Path $Directory -Leaf)" -WorkingDirectory $Directory -Command "npm.cmd" -Arguments @("ci", "--no-audit", "--no-fund"))
    }

    return (Invoke-Step -Name "Install dependencies: $(Split-Path $Directory -Leaf)" -WorkingDirectory $Directory -Command "npm.cmd" -Arguments @("install", "--no-package-lock", "--no-audit", "--no-fund"))
}

function Invoke-MigrationReplay {
    $psqlCommand = Get-Command psql -ErrorAction SilentlyContinue
    if (-not $psqlCommand) {
        Write-Host "psql was not found. Install PostgreSQL client tools and ensure a local PostgreSQL server is running." -ForegroundColor Red
        return $false
    }

    $migrationsDirectory = Join-Path $Root "db/migrations"
    $stub = Join-Path $Root "db/supabase-stub.sql"
    $baseline = Join-Path $migrationsDirectory "001_baseline.sql"
    foreach ($requiredFile in @($stub, $baseline)) {
        if (-not (Test-Path $requiredFile -PathType Leaf)) {
            Write-Host "Required migration replay file is missing: $requiredFile" -ForegroundColor Red
            return $false
        }
    }

    $activeMigrations = @(
        Get-ChildItem -Path $migrationsDirectory -Filter "???_*.sql" -File |
            Where-Object {
                $prefix = $_.Name.Substring(0, 3)
                $prefix -match '^[0-9]{3}$' -and [int]$prefix -ge 10
            } |
            Sort-Object Name
    )

    $expectedMigrationSequence = (10..152 | ForEach-Object { "{0:D3}" -f $_ }) -join ","
    $actualMigrationSequence = ($activeMigrations | ForEach-Object { $_.Name.Substring(0, 3) }) -join ","
    if ($activeMigrations.Count -ne 143 -or $actualMigrationSequence -ne $expectedMigrationSequence) {
        Write-Host "Expected the exact contiguous migration sequence 010-152 (143 files); found $($activeMigrations.Count) files with sequence: $actualMigrationSequence. Refusing an incomplete or unexpected replay." -ForegroundColor Red
        return $false
    }

    $database = "pinposy_verify_$PID$([guid]::NewGuid().ToString('N').Substring(0, 8))"
    $psql = $psqlCommand.Source
    $databaseCreated = $false
    $replaySucceeded = $false

    function Invoke-LocalPsql {
        param(
            [string]$Executable,
            [string[]]$Arguments
        )

        & $Executable @Arguments | Out-Host
        return $LASTEXITCODE
    }

    try {
        Write-Host ""
        Write-Host "> Create disposable PostgreSQL database: $database" -ForegroundColor Cyan
        $psqlExitCode = Invoke-LocalPsql -Executable $psql -Arguments @("-X", "-h", "127.0.0.1", "-p", "$PostgresPort", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-c", "CREATE DATABASE $database")
        if ($psqlExitCode -ne 0) {
            throw "Could not create the disposable database. Check that PostgreSQL is running and the current role can create databases."
        }
        $databaseCreated = $true

        Write-Host "> Apply Supabase test stubs" -ForegroundColor Cyan
        $psqlExitCode = Invoke-LocalPsql -Executable $psql -Arguments @("-X", "-h", "127.0.0.1", "-p", "$PostgresPort", "-v", "ON_ERROR_STOP=1", "-d", $database, "-f", $stub)
        if ($psqlExitCode -ne 0) {
            throw "Supabase test stubs failed."
        }

        Write-Host "> Apply canonical baseline: 001_baseline.sql" -ForegroundColor Cyan
        $psqlExitCode = Invoke-LocalPsql -Executable $psql -Arguments @("-X", "-h", "127.0.0.1", "-p", "$PostgresPort", "-v", "ON_ERROR_STOP=1", "-d", $database, "-f", $baseline)
        if ($psqlExitCode -ne 0) {
            throw "Canonical baseline failed: 001_baseline.sql"
        }

        foreach ($migration in $activeMigrations) {
            Write-Host "  Applying $($migration.Name)"
            $psqlExitCode = Invoke-LocalPsql -Executable $psql -Arguments @("-X", "-h", "127.0.0.1", "-p", "$PostgresPort", "-v", "ON_ERROR_STOP=1", "-d", $database, "-f", $migration.FullName)
            if ($psqlExitCode -ne 0) {
                throw "Migration failed: $($migration.Name)"
            }
        }

        $replaySucceeded = $true
    }
    catch {
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
    finally {
        if ($databaseCreated) {
            Write-Host "> Drop disposable PostgreSQL database: $database" -ForegroundColor Cyan
            $psqlExitCode = Invoke-LocalPsql -Executable $psql -Arguments @("-X", "-h", "127.0.0.1", "-p", "$PostgresPort", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-c", "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$database' AND pid <> pg_backend_pid();")
            if ($psqlExitCode -ne 0) {
                Write-Host "WARNING: Could not terminate remaining connections to $database." -ForegroundColor Yellow
            }
            $psqlExitCode = Invoke-LocalPsql -Executable $psql -Arguments @("-X", "-h", "127.0.0.1", "-p", "$PostgresPort", "-v", "ON_ERROR_STOP=1", "-d", "postgres", "-c", "DROP DATABASE IF EXISTS $database")
            if ($psqlExitCode -ne 0) {
                Write-Host "WARNING: Failed to remove disposable database $database; remove it manually after checking its name." -ForegroundColor Yellow
                $replaySucceeded = $false
            }
        }
    }

    return $replaySucceeded
}

if (-not $MigrationsOnly) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js is required. Install Node.js 22.12 or newer and rerun this script."
    }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw "npm.cmd is required. Repair the Node.js installation and rerun this script."
    }

    $NodeVersionText = & node -p "process.versions.node"
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to determine the installed Node.js version."
    }
    try {
        $NodeVersion = [version]$NodeVersionText
    } catch {
        throw "Unable to parse the installed Node.js version: $NodeVersionText"
    }
    if ($NodeVersion -lt [version]"22.12.0") {
        throw "Node.js 22.12 or newer is required. Installed version: $NodeVersionText"
    }

    $Backend = Join-Path $Root "backend"
    $Frontend = Join-Path $Root "frontend"

    if (-not (Ensure-Dependencies -Directory $Backend -HasLockFile $true)) {
        $Failed = $true
    } else {
        if (-not (Invoke-Step -Name "Backend syntax check" -WorkingDirectory $Backend -Command "node" -Arguments @("--check", "index.js"))) {
            $Failed = $true
        }
        if (-not (Invoke-Step -Name "Backend analyze.js syntax check" -WorkingDirectory $Backend -Command "node" -Arguments @("--check", "analyze.js"))) {
            $Failed = $true
        }
        if (-not (Invoke-Step -Name "Backend boards.js syntax check" -WorkingDirectory $Backend -Command "node" -Arguments @("--check", "boards.js"))) {
            $Failed = $true
        }
        if (-not (Invoke-Step -Name "Backend textOutputValidation.js syntax check" -WorkingDirectory $Backend -Command "node" -Arguments @("--check", "textOutputValidation.js"))) {
            $Failed = $true
        }
        if (-not (Invoke-Step -Name "Backend tests" -WorkingDirectory $Backend -Command "npm.cmd" -Arguments @("test"))) {
            $Failed = $true
        }
    }

    if (-not (Ensure-Dependencies -Directory $Frontend -HasLockFile $true)) {
        $Failed = $true
    } else {
        if (-not (Invoke-Step -Name "Frontend type-check" -WorkingDirectory $Frontend -Command "npm.cmd" -Arguments @("run", "lint"))) {
            $Failed = $true
        }
        if (-not (Invoke-Step -Name "Frontend tests" -WorkingDirectory $Frontend -Command "npm.cmd" -Arguments @("test"))) {
            $Failed = $true
        }
        if (-not (Invoke-Step -Name "Frontend production build" -WorkingDirectory $Frontend -Command "npm.cmd" -Arguments @("run", "build"))) {
            $Failed = $true
        }
    }
}

if ($Migrations -or $MigrationsOnly) {
    $migrationResult = Invoke-MigrationReplay
    if ($migrationResult) {
        $Summary.Add("PASS  PostgreSQL migration replay (001 + 010-151)")
    } else {
        $Summary.Add("FAIL  PostgreSQL migration replay (001 + 010-151)")
        $Failed = $true
    }
}

Write-Host ""
Write-Host "======== PinPosy verification summary ========" -ForegroundColor Cyan
foreach ($line in $Summary) {
    if ($line.StartsWith("PASS")) {
        Write-Host $line -ForegroundColor Green
    } else {
        Write-Host $line -ForegroundColor Red
    }
}

if ($Failed) {
    exit 1
}

Write-Host "All configured checks passed." -ForegroundColor Green
exit 0
