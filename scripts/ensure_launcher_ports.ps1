param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path $ProjectRoot).Path.TrimEnd('\')

function Test-ProjectProcess {
    param([int]$TargetProcessId)

    $currentPid = $TargetProcessId
    $seen = @{}
    for ($i = 0; $i -lt 8; $i++) {
        if (-not $currentPid -or $seen.ContainsKey($currentPid)) {
            return $false
        }
        $seen[$currentPid] = $true
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$currentPid" -ErrorAction SilentlyContinue
        if (-not $proc) {
            return $false
        }

        $cmd = [string]$proc.CommandLine
        $exe = [string]$proc.ExecutablePath
        if ($cmd.Contains($root) -or $exe.Contains($root)) {
            return $true
        }

        # A janela de backend pode iniciar o uvicorn com o diretório de trabalho
        # apontando para o projeto, mas sem repetir esse caminho na CommandLine.
        # Nessa situação, o comando e a porta ainda identificam a instância do
        # RAG Lab com segurança suficiente para a limpeza do launcher.
        if ($cmd -match '(?i)uvicorn\s+app\.main:app' -and $cmd -match '(?i)--port\s+8000') {
            return $true
        }

        if ($cmd -match '(?i)(vite(?:\.js)?|npm(?:\.cmd)?)' -and $cmd -match '(?i)(--host\s+127\.0\.0\.1|vite)') {
            return $true
        }

        if ($cmd -match '(?i)chroma(?:\.exe)?\s+run' -and $cmd -match '(?i)--port\s+8001') {
            return $true
        }

        $currentPid = [int]$proc.ParentProcessId
    }

    return $false
}

function Get-ListeningPids {
    param([int]$Port)

    $pattern = '^\s*TCP\s+\S+:' + [regex]::Escape([string]$Port) + '\s+\S+\s+LISTENING\s+(\d+)\s*$'
    $lines = & netstat -ano -p tcp
    foreach ($line in $lines) {
        if ($line -match $pattern) {
            [int]$matches[1]
        }
    }
}

function Stop-ProjectPort {
    param(
        [int]$Port,
        [string]$Name
    )

    $ownerPids = @(Get-ListeningPids -Port $Port | Select-Object -Unique)
    foreach ($ownerPid in $ownerPids) {
        if (-not $ownerPid) {
            continue
        }

        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction SilentlyContinue
        $cmd = if ($proc) { [string]$proc.CommandLine } else { '' }

        if (Test-ProjectProcess -TargetProcessId $ownerPid) {
            Write-Host "[ports] Parando $Name antigo na porta $Port (PID $ownerPid)."
            Stop-Process -Id $ownerPid -Force -ErrorAction Stop
        } else {
            Write-Host "[ports] ERRO: porta $Port esta em uso por outro processo (PID $ownerPid)."
            Write-Host "[ports] Comando: $cmd"
            exit 20
        }
    }
}

Stop-ProjectPort -Port 8000 -Name 'backend'
Stop-ProjectPort -Port 8001 -Name 'chroma'
Stop-ProjectPort -Port 5173 -Name 'frontend'
Start-Sleep -Milliseconds 700
