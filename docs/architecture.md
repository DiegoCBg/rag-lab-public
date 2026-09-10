# Arquitetura do RAG Lab Protótipo

## Escopo

O sistema público expõe exatamente duas estratégias de recuperação: `vector` e `hybrid`.

## Componentes

### Backend

- `backend/app/main.py`: cria a aplicação FastAPI e registra os routers.
- `backend/app/api/routes/`: autenticação, documentos, provedores, consultas, comparações, auditoria e configurações.
- `backend/app/rag/strategies.py`: implementa `VectorStrategy` e `HybridStrategy`.
- `backend/app/rag/registry.py`: publica os identificadores e rótulos das duas estratégias.
- `backend/app/services/chroma_service.py`: acesso à coleção de chunks.
- `backend/app/services/embedding_service.py`: geração de embeddings.
- `backend/app/services/rag_service.py`: recuperação, geração da resposta e métricas.
- `backend/app/services/comparison_service.py`: execução lado a lado, auditoria e síntese.
- `backend/app/services/document_service.py`: upload, extração e ciclo de vida dos documentos.

### Frontend

O frontend React apresenta documentos, consulta, comparação, histórico, auditoria, métricas e configurações. Os seletores e respostas usam apenas `vector` e `hybrid`.

## Fluxo de uma consulta

1. O cliente envia uma pergunta, a estratégia e o escopo de documentos para `POST /rag/runs`.
2. O registry cria a estratégia selecionada.
3. A estratégia consulta os chunks indexados no ChromaDB.
4. O provedor configurado gera a resposta usando as evidências recuperadas.
5. O backend retorna resposta, chunks, métricas, eventos e identificador da execução.

## Fluxo de comparação

`POST /comparisons/run` valida o escopo, executa Vector e Hybrid sobre a mesma pergunta, audita as respostas individualmente e produz uma síntese comparativa persistida no SQLite.

## Dados de execução

O upload de um documento gera registro no SQLite, arquivo temporário de origem e chunks/embeddings no índice configurado. Esses dados são criados em tempo de execução e devem permanecer fora da distribuição do código.

## Contratos principais

- Estratégias válidas: `vector`, `hybrid`.
- Documentos consultáveis: documentos indexados e compatíveis com o provedor de embeddings ativo.
- Evidências: chunks retornados pela recuperação, identificados por documento, arquivo e chunk.
- Comparação: exatamente as duas estratégias públicas, sem duplicidade.
