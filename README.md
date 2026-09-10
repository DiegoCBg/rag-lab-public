# RAG Lab Protótipo

Laboratório público para executar e comparar recuperação aumentada por geração (RAG) sobre um corpus de documentos.

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

- Python 3.12+
- Node.js 18+
- ChromaDB disponível no endereço configurado
- Um provedor de embeddings e geração configurado, como Ollama local ou um provedor externo

## Execução local

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item ..\.env.example .env
python -m uvicorn app.main:app --reload --port 8000
```

Em outro terminal:

```powershell
cd frontend
npm install
npm run dev
```

Por padrão, a API escuta em `http://127.0.0.1:8000` e o frontend em `http://localhost:5173`.

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
