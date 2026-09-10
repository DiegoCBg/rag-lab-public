from fastapi import APIRouter
from app.api.routes import (
    admin_users,
    auth,
    benchmark,
    comparisons,
    documents,
    executions,
    experiments,
    ollama,
    providers,
    rag,
    settings,
    system,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix='/auth', tags=['auth'])
api_router.include_router(admin_users.router, tags=['admin-users'])
api_router.include_router(documents.router, prefix='/documents', tags=['documents'])
api_router.include_router(providers.router, prefix='/providers', tags=['providers'])
api_router.include_router(rag.router, prefix='/rag', tags=['rag'])
api_router.include_router(system.router, prefix='/system', tags=['system'])
api_router.include_router(executions.router, prefix='/executions', tags=['executions'])
api_router.include_router(benchmark.router, prefix='/benchmark', tags=['benchmark'])
api_router.include_router(experiments.router, prefix='/experiments', tags=['experiments'])
api_router.include_router(comparisons.router, prefix='/comparisons', tags=['comparisons'])
api_router.include_router(settings.router, tags=['settings'])
api_router.include_router(ollama.router, tags=['ollama'])
