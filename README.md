# RAG Lab Protótipo

Laboratório público para executar e comparar recuperação aumentada por geração (RAG) sobre um corpus de documentos.

## Termos de uso

Este repositório é uma demonstração para avaliação técnica, com código disponível para consulta. É permitido baixar e executar localmente para avaliação não comercial, conforme [LICENSE.md](LICENSE.md). Não é concedida permissão para modificar o código, reutilizá-lo em outros projetos ou usá-lo comercialmente. Os passos de configuração abaixo destinam-se a essa avaliação. Não se trata de uma licença de código aberto; aplicam-se as ressalvas legais, as licenças de terceiros e os termos do GitHub descritos no documento.

## Estratégias disponíveis

O projeto contém exatamente estas duas estratégias:

| Estratégia | Descrição |
|---|---|
| Vector | Busca por similaridade semântica usando embeddings no ChromaDB. |
| Hybrid | Combina recuperação vetorial (70%) com sobreposição lexical de termos (30%). |

## Arquitetura

```text
frontend/          React + MUI + TanStack Query
backend/app/       FastAPI
├── api/            Rotas REST
├── core/           Configuração
├── models/         Modelos SQLAlchemy
├── rag/            Estratégias Vector e Hybrid
└── services/       Documentos, índice, provedores, consultas e comparação
```

O fluxo público é: upload e indexação de documentos, consulta com Vector ou Hybrid, comparação das duas estratégias, auditoria das evidências e síntese dos resultados.

## Pré-requisitos

- Python 3.11 ou 3.12, com `pip` e `venv`.
- Node.js 22.13+ na série 22, com npm, para atender também às dependências de testes.
- Ollama instalado e disponível no computador para o roteiro local abaixo.
- Espaço em disco e memória suficientes para os modelos escolhidos. O download dos modelos requer internet.

O ChromaDB é instalado com as dependências do backend, mas precisa ser iniciado como um serviço separado.

## Execução local

Os comandos abaixo usam Windows PowerShell. Baixe o ZIP do repositório e extraia-o, ou faça um clone. Abra o terminal na raiz da pasta obtida, onde estão `backend/` e `frontend/`.

### 1. Preparar o backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item ..\.env.example .env
```

Copie o arquivo somente na primeira instalação; preserve seu `.env` nas atualizações. Ele deve ficar em `backend/.env`, e os comandos do backend devem ser executados dentro de `backend/`.

Edite `backend/.env` e ajuste estas entradas antes de iniciar:

```dotenv
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_CONTEXT_TOKENS=8192
DEFAULT_CHAT_PROVIDER=ollama
DEFAULT_RAG_STRATEGY=hybrid
CHROMA_HOST=127.0.0.1
CHROMA_PORT=8001
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

`OLLAMA_MODEL` é o modelo que escreve as respostas; `OLLAMA_EMBEDDING_MODEL` transforma textos em vetores. Substitua o valor de `OLLAMA_MODEL` copiado do exemplo: `nomic-embed-text` é um modelo de embeddings e não deve ser usado para gerar respostas. Se escolher outro modelo de geração, use exatamente o nome instalado no Ollama.

Gere uma chave local com o comando abaixo e coloque o resultado no campo `SECRET_KEY` do `.env`:

```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
```

Para este roteiro com Ollama, deixe `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` e `DEEPSEEK_API_KEY` vazias. Nunca publique seu `.env` preenchido.

### 2. Preparar os modelos

Com o Ollama em execução, rode:

```powershell
ollama pull llama3.1
ollama pull nomic-embed-text
ollama list
```

Se o serviço não estiver ativo, execute `ollama serve` em um terminal separado e mantenha-o aberto. Não inicie outra instância se o aplicativo Ollama já estiver servindo na porta 11434.

### 3. Iniciar o ChromaDB

Em um terminal na pasta `backend/`, execute e mantenha o processo aberto:

```powershell
.\.venv\Scripts\chroma.exe run --path ./storage/indexes/chroma_db --host 127.0.0.1 --port 8001
```

### 4. Iniciar a API

Em outro terminal na pasta `backend/`:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Na primeira inicialização, a API cria o banco SQLite e suas tabelas automaticamente. Não é necessário importar banco ou cadastrar usuários por script. Confira a API em `http://127.0.0.1:8000/health`; a resposta deve conter `"status": "ok"`. Esse endpoint confirma a API, não a disponibilidade dos modelos e do Chroma.

### 5. Iniciar o frontend

Em outro terminal, partindo da raiz do projeto:

```powershell
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Abra `http://127.0.0.1:5173`. Mantenha os processos da API, Chroma, frontend e Ollama ativos durante o uso. Nas próximas execuções, não é necessário reinstalar dependências nem baixar novamente os mesmos modelos.

## Primeiro acesso e login

Não há usuário ou senha padrão. Cada instalação começa sem contas e sem documentos.

1. Abra `http://127.0.0.1:5173/register`, ou clique no link de cadastro da tela de login.
2. Escolha um nome de usuário com pelo menos 3 caracteres e uma senha com pelo menos 6 caracteres. O e-mail é opcional.
3. O primeiro usuário cadastrado torna-se administrador automaticamente. Os seguintes são usuários comuns.
4. Após o cadastro, entre com o nome de usuário e a senha que você acabou de criar.
5. Em Configurações, confira o provedor Ollama e os modelos antes de enviar documentos.

As contas e os hashes das senhas ficam no banco SQLite da própria instalação. O código-fonte não contém contas prontas. As configurações salvas pela interface prevalecem sobre os valores do `.env`.

Este roteiro é para uso local. O fluxo de recuperação de senha é local e não verifica identidade por e-mail; não exponha a API diretamente à internet como um serviço de autenticação público.

## Problemas no primeiro uso

- **Chroma indisponível:** confira se o terminal do Chroma continua aberto na porta 8001.
- **Modelo não encontrado ou falha na geração:** confira `ollama list`, o nome do modelo de geração e o modelo de embeddings. Um modelo de embeddings não gera respostas.
- **Erro de conexão ou CORS no login:** confira a API na porta 8000 e mantenha o frontend no endereço e porta indicados acima.
- **Porta ocupada:** encerre a instância anterior correspondente antes de iniciar outra.

## Uso

1. Envie um PDF, TXT ou Markdown na página Documentos.
2. Aguarde o documento ficar indexado.
3. Faça uma consulta escolhendo Vector ou Hybrid.
4. Use Comparação para executar as duas estratégias na mesma pergunta.
5. Consulte as evidências, métricas, auditoria e síntese produzidas.

## Persistência

Os caminhos de desenvolvimento são configurados por variáveis de ambiente. O banco SQLite, os uploads e o índice local são dados de execução e não fazem parte do código-fonte público.

## Testes

```powershell
cd backend
pytest -q

cd ..\frontend
npm run typecheck
npm test -- --run
npm run build
```
