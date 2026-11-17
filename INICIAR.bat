@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title RPG AI
docker info >nul 2>nul || (
  echo Abra o Docker Desktop, espere ficar pronto e tente de novo.
  pause & exit /b 1
)
docker compose up -d
node --env-file=.env packages\db\dist\cli.js migrate

echo Iniciando o RPG AI (3 janelas vao abrir; nao feche enquanto estiver jogando)...
start "RPG AI - login (somente local)" cmd /k node --env-file=.env tools\auth-emulator\server.mjs
start "RPG AI - servidor" cmd /k "cd apps\api && node --env-file=..\..\.env dist\main.js"
start "RPG AI - site" cmd /k "cd apps\web && pnpm start"
timeout /t 8 /nobreak >nul
start "" http://localhost:3000
echo.
echo O RPG AI abriu no navegador: http://localhost:3000
echo Para encerrar, feche as 3 janelas pretas.
echo Para jogar com amigos de outros computadores, o site precisa ser publicado na internet (veja docs\setup-supabase.md).
pause
