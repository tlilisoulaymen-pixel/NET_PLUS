@echo off
title NetPlus Launcher
echo ====================================================
echo         Demarrage du serveur NetPlus...
echo ====================================================
echo.

:: 0. Verifier si Docker est lance
docker info >nul 2>&1
if %errorlevel% equ 0 goto docker_ready

echo [!] Docker n'est pas actif. Demarrage de Docker Desktop...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo [!] Veuillez patienter pendant le lancement de Docker (cela peut prendre quelques secondes)...

:wait_docker
timeout /t 3 /nobreak >nul
docker info >nul 2>&1
if %errorlevel% neq 0 goto wait_docker

echo [+] Docker est maintenant pret !
echo.

:docker_ready
:: 1. Start Docker Containers
cd /d "%~dp0frappe_docker"
echo [+] Lancement des conteneurs Docker (en arriere-plan)...
docker compose -f pwd.yml -f compose.netplus.yaml up -d
docker compose -f pwd.yml -f compose.netplus.yaml exec -T backend /home/frappe/frappe-bench/env/bin/pip install -q -e /home/frappe/frappe-bench/apps/netplus >nul 2>&1
docker compose -f pwd.yml -f compose.netplus.yaml exec -T backend ln -sfn /home/frappe/frappe-bench/apps/netplus/netplus/public /home/frappe/frappe-bench/assets/netplus >nul 2>&1
docker compose -f pwd.yml -f compose.netplus.yaml exec -T frontend ln -sfn /home/frappe/frappe-bench/apps/netplus/netplus/public /home/frappe/frappe-bench/assets/netplus >nul 2>&1

echo.
echo [+] Backend ERPNext disponible sur : http://localhost:8080
echo.

:: 2. Launch Net Plus Desk (Next.js frontend) in a separate window
echo [+] Demarrage du frontend Net Plus Desk...
cd /d "%~dp0netplus-desk"

:: Create .env from example if missing
IF NOT EXIST ".env" (
    echo [netplus-desk] Creation du .env depuis .env.example...
    copy ".env.example" ".env" >nul
)

:: Clean stale .next cache and rogue lockfiles that cause EINVAL on Windows/OneDrive
echo [+] Nettoyage du cache Next.js (.next) et des lockfiles parasites...
IF EXIST ".next" (
    rmdir /s /q ".next" >nul 2>&1
    echo     Cache .next supprime.
)
IF EXIST "C:\Users\%USERNAME%\yarn.lock" (
    del /f /q "C:\Users\%USERNAME%\yarn.lock" >nul 2>&1
    echo     yarn.lock parasite supprime.
)

:: Start Next.js in a new window (keeps this window free for the tunnel)
start "Net Plus Desk" cmd /k "npm run dev"

:: Wait a few seconds for Next.js to boot, then open the browser
echo [+] Ouverture du navigateur dans 10 secondes (attente du demarrage Next.js)...
timeout /t 10 /nobreak >nul
start http://localhost:3000/login

:: 3. Start Public Tunnel
cd /d "%~dp0"
echo ====================================================
echo         Generation du lien public...
echo ====================================================
echo.
echo Gardez cette fenetre ouverte pour que le lien public reste actif !
echo Reperez votre URL publique ci-dessous (elle se termine par .lhr.life)
echo Exemple : https://xxxxx.lhr.life
echo.

ssh -R 80:localhost:8080 -o StrictHostKeyChecking=no nokey@localhost.run

pause
