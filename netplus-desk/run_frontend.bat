@echo off
cd /d "%~dp0"

REM Create .env from example if it doesn't exist yet
IF NOT EXIST ".env" (
    echo [netplus-desk] Creating .env from .env.example...
    copy ".env.example" ".env" >nul
    echo [netplus-desk] .env created. Edit FRAPPE_URL if needed.
)

echo [netplus-desk] Starting Next.js dev server on http://localhost:3000 ...
npm run dev
