@echo off
setlocal
title [DEBUG] Iniciador do Sistema de Emprestimos

:: Garante que os comandos sejam executados na pasta do script
cd /d "%~dp0"

cls
echo =================================================
echo  MODO DE DIAGNOSTICO - PROJETO CEARA
echo =================================================
echo.
echo Este script vai executar passo a passo e pausar no final
echo para que voce possa ver qualquer mensagem de erro.
echo.

echo [PASSO 1 de 2] Instalando dependencias...
echo.

:: Nao vamos mais apagar tudo, apenas instalar o que falta.
npm install

if %errorlevel% neq 0 (
    echo.
    echo  ### ERRO CRITICO ###
    echo  A instalacao das dependencias falhou.
    echo  Role para cima e veja a mensagem de erro detalhada.
    pause
    exit /b
)

echo.
echo  - Dependencias verificadas com sucesso!
echo.

echo [PASSO 2 de 2] Iniciando o servidor...
echo.
echo -------------------------------------------------

:: Libera a porta 3001 caso uma versao antiga ainda esteja em execucao.
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
    taskkill /PID %%P /F >nul 2>&1
)

:: Executa o servidor. A janela NAO vai fechar.
node server.js

echo -------------------------------------------------
echo.
echo O SCRIPT TERMINOU.
echo Se voce esta vendo esta mensagem, o servidor falhou ao iniciar.
echo Role para cima e procure por uma mensagem de ERRO.
pause