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
# 3. Build payload/
# -------------------------------------------------------
if (-not $SkipPayload) {
    Write-Step "Building payload/..."
    $include = @(
        "netplus_app","netplus-desk","frappe_docker",
        "analytics-addon","doc-flow-addon","print-studio-addon",
        "tracking-center-addon","ngrok","INSTALL.sh",
        "start_netplus.bat","build-portal.ps1"
    )
    $excludeDirs  = @("node_modules",".next","__pycache__",".git","dist","payload")
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
# 4. Compile installer
# -------------------------------------------------------
Write-Step "Compiling installer..."
New-Item -ItemType Directory -Path $distDir -Force | Out-Null

$issContent = Get-Content $issFile -Raw -Encoding UTF8
$issContent = $issContent -replace '#define AppVersion "[\d\.]+"', ('#define AppVersion "' + $Version + '"')
[System.IO.File]::WriteAllText($issFile, $issContent, [System.Text.Encoding]::UTF8)

& $iscc $issFile
if ($LASTEXITCODE -ne 0) { Write-Err "Compilation failed (exit code $LASTEXITCODE)." }

# -------------------------------------------------------
# 5. Report
# -------------------------------------------------------
$exe = Get-ChildItem $distDir -Filter "*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($exe) {
    $sizeMB = [math]::Round($exe.Length / 1MB, 1)
    Write-Step "Installer ready!"
    Write-Ok "File : $($exe.FullName)"
    Write-Ok "Size : ${sizeMB} MB"
    Write-Host ""
    Write-Host "  Ship this file to your customers." -ForegroundColor White
    Write-Host "  Tip: sign it with signtool to avoid SmartScreen warnings." -ForegroundColor Yellow
} else {
    Write-Err "No .exe found in dist/."
}