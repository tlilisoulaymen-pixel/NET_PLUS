# ============================================================
#  NetPlus — Automated installer builder
#  Run from the repo root: .\installer\build-installer.ps1
#
#  What this script does:
#    1. Checks Inno Setup 6 is installed (downloads if missing)
#    2. Creates the payload/ folder with the right app files
#       (excludes .git, node_modules, .next, __pycache__, etc.)
#    3. Compiles netplus-installer.iss → dist\NetPlus-Setup-x.x.x.exe
#    4. Reports the output path and file size
# ============================================================

param(
    [string]$Version = "1.0.0",
    [switch]$SkipPayload   # Skip copying payload (if already done)
)

$ErrorActionPreference = "Stop"
$scriptDir  = $PSScriptRoot                               # installer/
$repoRoot   = Split-Path $scriptDir -Parent               # repo root
$payloadDir = Join-Path $scriptDir "payload"
$issFile    = Join-Path $scriptDir "netplus-installer.iss"
$distDir    = Join-Path $scriptDir "dist"

# ── Colours ────────────────────────────────────────────────
function Write-Step($msg)  { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "    !!  $msg" -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host "    XX  $msg" -ForegroundColor Red; exit 1 }

# ── 1. Locate / install Inno Setup ─────────────────────────
Write-Step "Vérification de Inno Setup 6..."
$iscc = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $iscc) {
    Write-Warn "Inno Setup 6 introuvable. Téléchargement via winget..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        winget install --id JRSoftware.InnoSetup -e --silent --accept-package-agreements --accept-source-agreements
        $iscc = @(
            "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
            "C:\Program Files\Inno Setup 6\ISCC.exe"
        ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    }
    if (-not $iscc) {
        Write-Err "Inno Setup 6 non trouvé après installation. Installez-le manuellement: https://jrsoftware.org/isinfo.php"
    }
}
Write-Ok "Inno Setup: $iscc"

# ── 2. Build payload/ ───────────────────────────────────────
if (-not $SkipPayload) {
    Write-Step "Construction du dossier payload/..."

    # Folders to include from repo root
    $include = @(
        "netplus_app",
        "netplus-desk",
        "frappe_docker",
        "analytics-addon",
        "doc-flow-addon",
        "print-studio-addon",
        "tracking-center-addon",
        "ngrok",
        "INSTALL.sh",
        "start_netplus.bat",
        "build-portal.ps1"
    )

    # Patterns to exclude (robocopy /XD /XF patterns)
    $excludeDirs  = @("node_modules", ".next", "__pycache__", ".git", "dist", "payload")
    $excludeFiles = @("*.pyc", "*.log", "*.zip", ".env", ".env.local", "*.DS_Store")

    # Clean and recreate payload
    if (Test-Path $payloadDir) { Remove-Item $payloadDir -Recurse -Force }
    New-Item -ItemType Directory -Path $payloadDir | Out-Null

    foreach ($item in $include) {
        $src = Join-Path $repoRoot $item
        if (-not (Test-Path $src)) {
            Write-Warn "Introuvable (ignoré): $item"
            continue
        }

        $dst = Join-Path $payloadDir $item

        if (Test-Path $src -PathType Container) {
            # Use robocopy for directories — fast, handles exclusions natively
            $xdArgs = ($excludeDirs | ForEach-Object { $_ }) -join " "
            $xfArgs = ($excludeFiles | ForEach-Object { $_ }) -join " "
            robocopy $src $dst /E /XD $excludeDirs /XF $excludeFiles /NFL /NDL /NJH /NJS /NP | Out-Null
        } else {
            # Single file
            New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null
            Copy-Item $src $dst -Force
        }
        Write-Ok "Copié: $item"
    }

    $payloadSize = (Get-ChildItem $payloadDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
    $payloadMB   = [math]::Round($payloadSize / 1MB, 1)
    Write-Ok "Payload total: ${payloadMB} MB"
} else {
    Write-Warn "SkipPayload activé — payload/ non reconstruit."
}

# ── 3. Compile ──────────────────────────────────────────────
Write-Step "Compilation de l'installeur..."
New-Item -ItemType Directory -Path $distDir -Force | Out-Null

# Update version in .iss file dynamically if needed
$issContent = Get-Content $issFile -Raw
$issContent = $issContent -replace '#define AppVersion "[\d\.]+"', "#define AppVersion `"$Version`""
$issContent | Set-Content $issFile -Encoding UTF8

& $iscc $issFile
if ($LASTEXITCODE -ne 0) { Write-Err "Compilation échouée (code $LASTEXITCODE)." }

# ── 4. Report ───────────────────────────────────────────────
$exe = Get-ChildItem $distDir -Filter "*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($exe) {
    $sizeMB = [math]::Round($exe.Length / 1MB, 1)
    Write-Step "Installeur prêt !"
    Write-Ok "Fichier : $($exe.FullName)"
    Write-Ok "Taille  : ${sizeMB} MB"
    Write-Host ""
    Write-Host "  Distribuez ce fichier à vos clients." -ForegroundColor White
    Write-Host "  Recommandé : signez-le avec signtool pour éviter l'alerte SmartScreen." -ForegroundColor Yellow
} else {
    Write-Err "Aucun .exe trouvé dans dist/."
}
