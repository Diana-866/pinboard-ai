param(
    [switch]$SkipInstall
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

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required. Install Node.js 22 or newer and rerun this script."
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
if ($NodeVersion.Major -lt 22) {
    throw "Node.js 22 or newer is required. Installed version: $NodeVersionText"
}

$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"

if (-not (Ensure-Dependencies -Directory $Backend -HasLockFile $false)) {
    $Failed = $true
} else {
    if (-not (Invoke-Step -Name "Backend syntax check" -WorkingDirectory $Backend -Command "node" -Arguments @("--check", "index.js"))) {
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
