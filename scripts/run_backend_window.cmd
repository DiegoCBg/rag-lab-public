@echo off
setlocal
rem RAG Lab Protótipo - roda o backend via uvicorn
rem Se nenhum argumento for passado, usa o diretorio corrente (definido pelo caller via cd)

if "%~1"=="" (
    rem Modo automatico: usa o diretorio corrente (ja mudado pelo run_all.bat)
    goto :run
)

rem Modo com argumento: usa o caminho passado
for %%I in ("%~1") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%\backend"
if errorlevel 1 (
    echo ERRO: nao foi possivel acessar "%PROJECT_ROOT%\backend".
    pause
    exit /b 1
)
goto :run

:run
set "BACKEND_DIR=%CD%"
set "PY_EXE=%BACKEND_DIR%\.venv\Scripts\python.exe"
if not exist "%PY_EXE%" (
    echo ERRO: Python da .venv nao encontrado em "%PY_EXE%".
    echo O backend nao sera iniciado com o Python global.
    pause
    exit /b 1
)
"%PY_EXE%" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
echo === Backend exited. Press any key to close this window.
pause
endlocal
