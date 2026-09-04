@echo off
REM ============================================================
REM  NetPlus — Desktop launcher
REM  Starts Docker Desktop if needed, brings the NetPlus stack
REM  up, then opens the app in the default browser.
REM ============================================================

setlocal
title NetPlus — Démarrage...

REM --- CONFIGURE IF NEEDED ------------------------------------
set "APP_URL=http://localhost:8080"
set "COMPOSE_DIR=%~dp0frappe_docker"
REM ------------------------------------------------------------

echo.
echo  ============================================================
echo    NetPlus — Démarrage en cours, veuillez patienter...
echo  ============================================================
echo.

REM 1. Check Docker CLI is available
where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERREUR : Docker n'est pas installe ou introuvable dans le PATH.
    echo  Relancez le programme d'installation de NetPlus pour installer
    echo  les prerequis, ou installez Docker Desktop manuellement.
    pause
    exit /b 1
)

REM 2. Start Docker Desktop if the engine is not running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo  Demarrage de Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
)

REM 3. Wait for the engine (up to 5 minutes)
set /a tries=0
:waitdocker
docker info >nul 2>&1
if %errorlevel% equ 0 goto dockerup
set /a tries+=1
if %tries% geq 60 (
    echo.
    echo  ERREUR : Docker n'a pas demarre apres 5 minutes.
    echo  Si votre PC vient d'installer WSL2 ou Docker, un
    echo  redemarrage Windows est necessaire. Relancez ensuite
    echo  NetPlus depuis l'icone du bureau.
    pause
    exit /b 1
)
timeout /t 5 /nobreak >nul
goto waitdocker

:dockerup
echo  Docker operationnel.

REM 4. Start the NetPlus containers
echo  Demarrage des services NetPlus...
pushd "%COMPOSE_DIR%"
docker compose up -d
if %errorlevel% neq 0 (
    echo  ERREUR : impossible de demarrer les conteneurs NetPlus.
    echo  Verifiez que le dossier frappe_docker est intact.
    popd
    pause
    exit /b 1
)
popd

REM 5. Wait for the web app to answer (up to 5 minutes)
echo  Attente de l'application...
set /a tries=0
:waitapp
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri '%APP_URL%' -UseBasicParsing -TimeoutSec 3) | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 goto appup
set /a tries+=1
if %tries% geq 60 (
    echo  Delai depasse — ouverture du navigateur quand meme.
    goto appup
)
timeout /t 5 /nobreak >nul
goto waitapp

:appup
title NetPlus
echo  NetPlus est pret !
echo.
start "" "%APP_URL%"
exit /b 0
