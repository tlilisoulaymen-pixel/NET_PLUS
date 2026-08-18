# Build NetPlus Portal (React → Frappe www)
# Run from the workspace root: .\build-portal.ps1
#
# What this does:
#   1. Install deps in netplus-erp
#   2. Run Vite build → outputs to netplus_app/netplus/www/portal/
#   3. Frappe serves /portal as a static website page automatically

param(
    [switch]$SkipInstall
)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ErpDir = Join-Path $Root "netplus-erp"
$OutDir = Join-Path $Root "netplus_app\netplus\www\portal"

Write-Host "`n[1/3] NetPlus Portal Build" -ForegroundColor Cyan
Write-Host "  Source : $ErpDir"
Write-Host "  Output : $OutDir`n"

Push-Location $ErpDir

if (-not $SkipInstall) {
    Write-Host "[2/3] Installing dependencies..." -ForegroundColor Yellow
    if (Get-Command bun -ErrorAction SilentlyContinue) {
        bun install
    } elseif (Get-Command npm -ErrorAction SilentlyContinue) {
        npm install
    } else {
        Write-Error "Neither bun nor npm found. Install Node.js first."
        Pop-Location
        exit 1
    }
}

Write-Host "`n[3/3] Building production bundle..." -ForegroundColor Yellow
if (Get-Command bun -ErrorAction SilentlyContinue) {
    bun run build
} else {
    npm run build
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[FAIL] Build failed." -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location

Write-Host "`n[OK] Portal built to: $OutDir" -ForegroundColor Green
Write-Host "  Frappe will serve it at: /portal"
Write-Host "  Restart Frappe if needed: docker exec -it <backend> bench restart`n"
