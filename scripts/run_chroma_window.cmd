@echo off
setlocal
rem RAG Lab Protótipo - roda o Chroma em processo separado e visivel

set "BACKEND_DIR=%~dp0..\backend"
set "CHROMA_EXE=%BACKEND_DIR%\.venv\Scripts\chroma.exe"
set "CHROMA_PATH=%BACKEND_DIR%\storage\indexes\chroma_db"
set "CHROMA_LOG=%BACKEND_DIR%\storage\chroma.log"
set "ANONYMIZED_TELEMETRY=FALSE"
set "CHROMA_PRODUCT_TELEMETRY_IMPL=app.services.chroma_noop_telemetry.NoopProductTelemetry"
set "CHROMA_TELEMETRY_IMPL=app.services.chroma_noop_telemetry.NoopProductTelemetry"
rem O Chroma carrega a implementacao de telemetria por importacao dinamica.
rem Expor backend garante que o pacote app seja encontrado pela .venv.
set "PYTHONPATH=%BACKEND_DIR%;%PYTHONPATH%"

if not exist "%CHROMA_EXE%" (
    echo ERRO: Chroma nao encontrado em "%CHROMA_EXE%".
    echo Reinstale as dependencias do backend na .venv antes de iniciar.
    pause
    exit /b 1
)

if not exist "%BACKEND_DIR%\storage\indexes" mkdir "%BACKEND_DIR%\storage\indexes"

"%CHROMA_EXE%" run --path "%CHROMA_PATH%" --host 127.0.0.1 --port 8001 --log-path "%CHROMA_LOG%"
echo === Chroma exited. Press any key to close this window.
pause
endlocal
