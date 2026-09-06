# ============================================================
#  NetPlus — Prerequisites installer
#  Run by the setup wizard (as admin). Installs, in order:
#    1. WSL2  (required by Docker Desktop on Windows)
#    2. Docker Desktop (via winget, silent, fallback to direct download)
#    3. Waits for the Docker engine to be ready
#  Idempotent: safe to run again — skips anything already present.
# ============================================================

$ErrorActionPreference = "Stop"
$log = Join-Path $env:TEMP "netplus-prereqs.log"
Start-Transcript -Path $log -Append | Out-Null

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# ------------------------------------------------------------
# 1. WSL2
# ------------------------------------------------------------
Write-Step "Vérification de WSL2..."
$wslOk = $false
try {
    $out = wsl --status 2>&1
    if ($LASTEXITCODE -eq 0) { $wslOk = $true }
} catch { }

if (-not $wslOk) {
    Write-Step "Installation de WSL2 (quelques minutes)..."
    wsl --install --no-distribution
    Write-Host "WSL2 installe. Un redemarrage peut etre requis."
} else {
    Write-Host "WSL2 deja present."
    # Note: wsl --update skipped intentionally (long download, not critical at install time)
}

# ------------------------------------------------------------
# 2. Docker Desktop
# ------------------------------------------------------------
Write-Step "Verification de Docker Desktop..."
$dockerExe       = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
$dockerRegKey    = "HKLM:\SOFTWARE\Docker Inc.\Docker Desktop"
$dockerInstalled = Test-Path $dockerExe

# --- Detect broken install: registry key present but exe missing, or key malformed ---
$dockerBroken = $false
if (-not $dockerInstalled -and (Test-Path $dockerRegKey)) {
    Write-Host "Installation Docker Desktop corrompue detectee (cle registre orpheline)."
    $dockerBroken = $true
}
if ($dockerInstalled) {
    # Verify registry key has a valid backend path
    try {
        $backendPath = (Get-ItemProperty $dockerRegKey -ErrorAction Stop).Path
        if (-not (Test-Path $backendPath)) {
            Write-Host "Cle registre Docker Desktop pointe vers un chemin invalide: $backendPath"
            $dockerBroken = $true
        }
    } catch {
        Write-Host "Cle registre Docker Desktop manquante ou illisible."
        $dockerBroken = $true
    }
}

# --- Repair: clean up orphaned registry keys ---
if ($dockerBroken) {
    Write-Step "Nettoyage des entrees de registre Docker Desktop corrompues..."
    $regPaths = @(
        "HKLM:\SOFTWARE\Docker Inc.",
        "HKLM:\SOFTWARE\WOW6432Node\Docker Inc.",
        "HKCU:\SOFTWARE\Docker Inc."
    )
    foreach ($rp in $regPaths) {
        if (Test-Path $rp) {
            Remove-Item $rp -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  Supprime: $rp"
        }
    }

    # If exe is also missing, mark for fresh install
    if (-not $dockerInstalled) { $dockerInstalled = $false }
    else {
        # Exe exists but registry was broken — uninstall and reinstall cleanly
        Write-Step "Desinstallation de Docker Desktop (installation corrompue)..."
        $uninst = "C:\Program Files\Docker\Docker\Docker Desktop Installer.exe"
        if (Test-Path $uninst) {
            Start-Process -Wait -FilePath $uninst -ArgumentList "uninstall", "--quiet"
        }
        $dockerInstalled = $false
    }
}

if (-not $dockerInstalled) {
    Write-Step "Installation de Docker Desktop..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        winget install --id Docker.DockerDesktop -e --silent `
            --accept-package-agreements --accept-source-agreements
    } else {
        Write-Step "winget indisponible - telechargement direct de Docker Desktop..."
        $installer = Join-Path $env:TEMP "DockerDesktopInstaller.exe"
        Invoke-WebRequest `
            -Uri "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe" `
            -OutFile $installer -UseBasicParsing
        Start-Process -Wait -FilePath $installer `
            -ArgumentList "install", "--quiet", "--accept-license"
        Remove-Item $installer -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Docker Desktop installe."
} else {
    Write-Host "Docker Desktop deja installe et operationnel."
}

# --- Post-install: ensure registry key is present and valid ---
if (Test-Path $dockerExe) {
    $backendDir = "C:\Program Files\Docker\Docker\resources"
    $backend    = Join-Path $backendDir "com.docker.backend.exe"
    if (-not (Test-Path $dockerRegKey)) {
        Write-Step "Creation de la cle de registre Docker Desktop manquante..."
        New-Item -Path $dockerRegKey -Force | Out-Null
    }
    try {
        $existing = (Get-ItemProperty $dockerRegKey -ErrorAction Stop).Path
    } catch { $existing = $null }
    if (-not $existing -or -not (Test-Path $existing)) {
        if (Test-Path $backend) {
            Set-ItemProperty -Path $dockerRegKey -Name "Path" -Value $backend -Force
            Write-Host "  Cle registre reparee: $backend"
        }
    }
}

# ------------------------------------------------------------
# 3. Start Docker Desktop and wait for the engine
# ------------------------------------------------------------
Write-Step "Demarrage du moteur Docker..."
if (Test-Path $dockerExe) {
    $running = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
    if (-not $running) {
        Start-Process -FilePath $dockerExe
        Start-Sleep -Seconds 15   # give it time to start the backend
    }

    $tries = 0
    while ($tries -lt 24) {   # max 2 minutes (24 x 5s)
        docker info 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 5
        $tries++
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Moteur Docker operationnel."
    } else {
        Write-Host "Docker n'a pas demarre dans le delai imparti."
        Write-Host "Un redemarrage Windows est peut-etre necessaire."
        Write-Host "Relancez ensuite NetPlus via l'icone du bureau."
    }
}


Write-Step "Prérequis terminés. Journal: $log"

# ------------------------------------------------------------
# 4. Node.js LTS (required by netplus-desk Next.js frontend)
# ------------------------------------------------------------
Write-Step "Vérification de Node.js..."
$nodeOk = $false
try {
    $nodeVer = & node --version 2>&1
    if ($LASTEXITCODE -eq 0) { $nodeOk = $true; Write-Host "Node.js déjà présent: $nodeVer" }
} catch { }

if (-not $nodeOk) {
    Write-Step "Installation de Node.js LTS..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        winget install --id OpenJS.NodeJS.LTS -e --silent `
            --accept-package-agreements --accept-source-agreements
    } else {
        Write-Step "winget indisponible — téléchargement direct de Node.js..."
        $nodeInstaller = Join-Path $env:TEMP "node-lts-installer.msi"
        Invoke-WebRequest `
            -Uri "https://nodejs.org/dist/lts/node-v20-x64.msi" `
            -OutFile $nodeInstaller -UseBasicParsing
        Start-Process msiexec.exe -Wait -ArgumentList "/i `"$nodeInstaller`" /qn"
        Remove-Item $nodeInstaller -Force -ErrorAction SilentlyContinue
    }
    # Refresh PATH so npm is available immediately
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH","User")
    Write-Host "Node.js installé."
}

Write-Step "Tous les prérequis sont installés. Journal: $log"
Stop-Transcript | Out-Null
exit 0
