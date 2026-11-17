@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title RPG AI - Instalacao
echo ============================================================
echo   RPG AI - instalacao no seu computador (custo zero)
echo ============================================================
echo.

where winget >nul 2>nul || (
  echo [ERRO] O winget nao foi encontrado. Atualize o Instalador de Aplicativo pela Microsoft Store e tente de novo.
  pause & exit /b 1
)

where node >nul 2>nul || (
  echo [1/6] Instalando Node.js...
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  echo.
  echo Node.js instalado. FECHE esta janela e de dois cliques em INSTALAR.bat de novo.
  pause & exit /b 0
)

where docker >nul 2>nul || (
  echo [2/6] Instalando Docker Desktop - pode pedir permissao de administrador...
  winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
  echo.
  echo Docker instalado. REINICIE o computador, abra o Docker Desktop uma vez
  echo - aceite os termos e espere ficar "Engine running" - e rode INSTALAR.bat de novo.
  pause & exit /b 0
)

docker info >nul 2>nul || (
  echo [ERRO] O Docker Desktop nao esta aberto. Abra o Docker Desktop, espere ficar pronto e rode de novo.
  pause & exit /b 1
)

echo [3/6] Instalando pnpm...
call npm install -g pnpm@10 >nul || (echo [ERRO] Falha ao instalar pnpm & pause & exit /b 1)

if not exist ".env" copy ".env.example" ".env" >nul
if not exist "apps\web\.env.local" copy ".env.example" "apps\web\.env.local" >nul

echo [4/6] Baixando dependencias do projeto (alguns minutos na primeira vez)...
call pnpm install || (echo [ERRO] Falha no pnpm install & pause & exit /b 1)

echo [5/6] Compilando...
call pnpm build || (echo [ERRO] Falha na compilacao & pause & exit /b 1)

echo [6/6] Subindo banco de dados e preparando tabelas...
docker compose up -d || (echo [ERRO] Falha ao subir o banco & pause & exit /b 1)
timeout /t 8 /nobreak >nul
node --env-file=.env packages\db\dist\cli.js bootstrap-local || (echo [ERRO] Banco nao respondeu. Espere alguns segundos e rode de novo. & pause & exit /b 1)
node --env-file=.env packages\db\dist\cli.js migrate || (echo [ERRO] Falha nas migrations & pause & exit /b 1)

echo.
echo ============================================================
echo   Pronto! Agora de dois cliques em INICIAR.bat
echo ============================================================
pause
