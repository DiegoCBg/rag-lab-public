@echo off
setlocal
rem RAG Lab Protótipo - roda o frontend via Vite
rem Se nenhum argumento for passado, usa o diretorio corrente (definido pelo caller via cd)

if "%~1"=="" (
    rem Modo automatico: usa o diretorio corrente (ja mudado pelo run_all.bat)
    goto :run
)

rem Modo com argumento: usa o caminho passado
for %%I in ("%~1") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%\frontend"
if errorlevel 1 (
    echo ERRO: nao foi possivel acessar "%PROJECT_ROOT%\frontend".
    pause
    exit /b 1
)
goto :run

:run
npm run dev -- --host 127.0.0.1
if not errorlevel 1 goto :frontend_exited

rem O esbuild pode falhar na primeira tentativa durante a troca de processos.
rem Tentar novamente evita que o launcher deixe o usuario sem a interface.
set "RETRY_COUNT=1"
:retry_frontend
if %RETRY_COUNT% GEQ 3 goto :frontend_failed
echo === Frontend nao iniciou. Nova tentativa %RETRY_COUNT% em 2 segundos...
timeout /t 2 /nobreak >nul
set /a RETRY_COUNT+=1
npm run dev -- --host 127.0.0.1
if not errorlevel 1 goto :frontend_exited
goto :retry_frontend

:frontend_failed
echo === Frontend falhou apos 3 tentativas. Veja o erro acima.
echo === Pressione qualquer tecla para fechar esta janela.
pause
endlocal
exit /b 1

:frontend_exited
echo === Frontend encerrado. Pressione qualquer tecla para fechar esta janela.
pause
endlocal
