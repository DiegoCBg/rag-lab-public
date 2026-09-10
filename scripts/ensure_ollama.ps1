$ErrorActionPreference = 'Stop'
$ollamaUrl = 'http://127.0.0.1:11434/api/tags'
$embeddingModel = 'nomic-embed-text'

function Get-OllamaModels {
    try {
        return (Invoke-RestMethod -Uri $ollamaUrl -TimeoutSec 3).models
    } catch {
        return $null
    }
}

$models = Get-OllamaModels
if (-not $models) {
    $ollama = Get-Command ollama.exe -ErrorAction SilentlyContinue
    if (-not $ollama) {
        $ollama = Get-Command ollama -ErrorAction SilentlyContinue
    }

    if (-not $ollama) {
        Write-Host '[ollama] ERRO: executavel Ollama nao encontrado no PATH.'
        exit 21
    }

    Write-Host '[ollama] Iniciando servico local.'
    Start-Process -FilePath $ollama.Source -ArgumentList 'serve' -WindowStyle Hidden

    for ($attempt = 1; $attempt -le 15; $attempt++) {
        Start-Sleep -Seconds 1
        $models = Get-OllamaModels
        if ($models) {
            break
        }
    }
}

if (-not $models) {
    Write-Host '[ollama] ERRO: servico indisponivel em 127.0.0.1:11434.'
    exit 22
}

$modelNames = @($models | ForEach-Object { [string]$_.name })
if (-not ($modelNames | Where-Object { $_ -eq $embeddingModel -or $_ -like "${embeddingModel}:*" })) {
    Write-Host "[ollama] ERRO: modelo de embeddings '$embeddingModel' nao instalado. Execute: ollama pull $embeddingModel"
    exit 23
}

Write-Host '[ollama] Servico e modelo de embeddings prontos.'