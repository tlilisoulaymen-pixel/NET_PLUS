param(
    [string]$Version    = "1.0.0",
    [switch]$SkipPayload
)

$ErrorActionPreference = "Stop"
$scriptDir  = $PSScriptRoot
$repoRoot   = Split-Path $scriptDir -Parent
$payloadDir = Join-Path $scriptDir "payload"
$issFile    = Join-Path $scriptDir "netplus-installer.iss"
$distDir    = Join-Path $scriptDir "dist"
$launcherCs = Join-Path $scriptDir "launcher\NetPlusLauncher.cs"
$launcherExe= Join-Path $scriptDir "launcher\NetPlusLauncher.exe"

function Write-Step($msg)  { Write-Host "" ; Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "    !!  $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "    XX  $msg" -ForegroundColor Red; exit 1 }

# -------------------------------------------------------
# 1. Compile the C# silent launcher
# -------------------------------------------------------
Write-Step "Compiling silent launcher (NetPlusLauncher.exe)..."
$csc = @(
    "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $csc) { Write-Err "csc.exe not found. .NET Framework 4 is required." }

& $csc /nologo /target:winexe /optimize+ /out:"$launcherExe" `
    /reference:"System.Windows.Forms.dll" `
    /reference:"System.Drawing.dll" `
    /reference:"System.dll" `
    "$launcherCs" 2>&1 | Where-Object { $_ -match "error" } | ForEach-Object { Write-Warn $_ }

if ($LASTEXITCODE -ne 0) { Write-Err "Launcher compilation failed." }
$size = [math]::Round((Get-Item $launcherExe).Length / 1KB, 1)
Write-Ok "NetPlusLauncher.exe compiled ($size KB)"

# -------------------------------------------------------
# 2. Check / install Inno Setup
# -------------------------------------------------------
Write-Step "Checking Inno Setup 6..."
$iscc = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $iscc) {
    Write-Warn "Inno Setup 6 not found. Install: https://jrsoftware.org/isinfo.php"
    Write-Err "Inno Setup required to continue."
}
Write-Ok "Inno Setup: $iscc"

# -------------------------------------------------------
# 3. Build netplus-desk (Next.js) for production
# -------------------------------------------------------
if (-not $SkipPayload) {
    Write-Step "Building netplus-desk (Next.js production build)..."
    $deskDir = Join-Path $repoRoot "netplus-desk"

    # Install deps if node_modules missing
    if (-not (Test-Path (Join-Path $deskDir "node_modules"))) {
        Write-Warn "node_modules not found — running npm install..."
        & npm install --prefix $deskDir 2>&1 | Out-Null
    }

    # Build Next.js
    $env:FRAPPE_URL = "http://localhost:8080"
    & npm run build --prefix $deskDir 2>&1 | ForEach-Object {
        if ($_ -match "error|Error") { Write-Warn $_ }
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Next.js build failed — skipping .next in payload (app may not work for client)."
    } else {
        Write-Ok "netplus-desk built successfully (.next folder ready)"
    }
}

# -------------------------------------------------------
# 4. Build payload/
# -------------------------------------------------------
if (-not $SkipPayload) {
    Write-Step "Building payload/..."
    $include = @(
        "netplus_app","netplus-desk","frappe_docker",
        "analytics-addon","doc-flow-addon","print-studio-addon",
        "tracking-center-addon","ngrok","INSTALL.sh",
        "start_netplus.bat","build-portal.ps1"
    )
    # Note: .next is intentionally kept (pre-built Next.js output for the client)
    $excludeDirs  = @("node_modules","__pycache__",".git","dist","payload")
    $excludeFiles = @("*.pyc","*.log","*.zip",".env",".env.local")

    if (Test-Path $payloadDir) { Remove-Item $payloadDir -Recurse -Force }
    New-Item -ItemType Directory -Path $payloadDir | Out-Null

    foreach ($item in $include) {
        $src = Join-Path $repoRoot $item
        if (-not (Test-Path $src)) { Write-Warn "Not found (skipped): $item"; continue }
        $dst = Join-Path $payloadDir $item
        if (Test-Path $src -PathType Container) {
            robocopy $src $dst /E /XD $excludeDirs /XF $excludeFiles /NFL /NDL /NJH /NJS /NP | Out-Null
        } else {
            New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
            Copy-Item $src $dst -Force
        }
        Write-Ok "Copied: $item"
    }
    $payloadMB = [math]::Round(((Get-ChildItem $payloadDir -Recurse -File | Measure-Object -Property Length -Sum).Sum)/1MB, 1)
    Write-Ok "Payload size: ${payloadMB} MB"
} else {
    Write-Warn "-SkipPayload set - skipping payload copy."
}

# -------------------------------------------------------
# 5. Compile installer (output to temp to avoid OneDrive lock)
# -------------------------------------------------------
Write-Step "Compiling installer..."
New-Item -ItemType Directory -Path $distDir -Force | Out-Null

$issContent = Get-Content $issFile -Raw -Encoding UTF8
$issContent = $issContent -replace '#define AppVersion "[\d\.]+"', ('#define AppVersion "' + $Version + '"')
[System.IO.File]::WriteAllText($issFile, $issContent, [System.Text.Encoding]::UTF8)

# Build to %TEMP%\netplus-build to avoid OneDrive file-lock on dist/
$tempBuild = Join-Path $env:TEMP "netplus-build"
New-Item -ItemType Directory -Path $tempBuild -Force | Out-Null

# ISCC /O sets the output directory at compile time
& $iscc "/O$tempBuild" $issFile
if ($LASTEXITCODE -ne 0) { Write-Err "Compilation failed (exit code $LASTEXITCODE)." }

# -------------------------------------------------------
# 6. Copy from temp to dist/ and report
# -------------------------------------------------------
$tempExe = Get-ChildItem $tempBuild -Filter "*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($tempExe) {
    $finalExe = Join-Path $distDir $tempExe.Name
    Copy-Item $tempExe.FullName $finalExe -Force
    $sizeMB = [math]::Round((Get-Item $finalExe).Length / 1MB, 1)
    Write-Step "Installer ready!"
    Write-Ok "File : $finalExe"
    Write-Ok "Size : ${sizeMB} MB"
    Write-Host ""
    Write-Host "  Ship this file to your customers." -ForegroundColor White
    Write-Host "  Tip: sign it with signtool to avoid SmartScreen warnings." -ForegroundColor Yellow
} else {
    Write-Err "No .exe found in temp build dir ($tempBuild)."
}