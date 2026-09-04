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
    # --no-distribution: Docker Desktop ships its own WSL distro
    wsl --install --no-distribution
    Write-Host "WSL2 installé. Un redémarrage peut être requis."
} else {
    Write-Host "WSL2 déjà présent."
    wsl --update 2>$null | Out-Null   # keep kernel current
}

# ------------------------------------------------------------
# 2. Docker Desktop
# ------------------------------------------------------------
Write-Step "Vérification de Docker Desktop..."
$dockerExe  = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
$dockerCLI  = Get-Command docker -ErrorAction SilentlyContinue
$dockerInstalled = (Test-Path $dockerExe) -or ($dockerCLI -ne $null)

if (-not $dockerInstalled) {
    Write-Step "Installation de Docker Desktop..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        winget install --id Docker.DockerDesktop -e --silent `
            --accept-package-agreements --accept-source-agreements
    } else {
        Write-Step "winget indisponible — téléchargement direct de Docker Desktop..."
        $installer = Join-Path $env:TEMP "DockerDesktopInstaller.exe"
        Invoke-WebRequest `
            -Uri "https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe" `
            -OutFile $installer -UseBasicParsing
        Start-Process -Wait -FilePath $installer `
            -ArgumentList "install", "--quiet", "--accept-license"
        Remove-Item $installer -Force -ErrorAction SilentlyContinue
    }
    Write-Host "Docker Desktop installé."
} else {
    Write-Host "Docker Desktop déjà installé."
}

# ------------------------------------------------------------
# 3. Start Docker Desktop and wait for the engine
# ------------------------------------------------------------
Write-Step "Démarrage du moteur Docker..."
if (Test-Path $dockerExe) {
    # Launch Docker Desktop if not already running
    $running = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
    if (-not $running) {
        Start-Process -FilePath $dockerExe
        Start-Sleep -Seconds 10
    }

    $tries = 0
    while ($tries -lt 60) {
        docker info 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 5
        $tries++
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Moteur Docker opérationnel."
    } else {
        Write-Host "Docker n'a pas démarré dans le délai imparti."
        Write-Host "Un redémarrage Windows est peut-être nécessaire."
        Write-Host "Relancez ensuite NetPlus via l'icône du bureau."
    }
}

Write-Step "Prérequis terminés. Journal: $log"
Stop-Transcript | Out-Null
exit 0
