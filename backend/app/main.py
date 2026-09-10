from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.router import api_router
from app.core.config import settings
from app.db.migrate import run_migrations
from app.db.session import Base, SessionLocal, engine
from app.services import runtime_settings
from app.services.settings_service import SettingsService, _mask

Base.metadata.create_all(bind=engine)
run_migrations(engine)

with SessionLocal() as db:
    SettingsService.refresh_cache(db)

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(',') if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.app_name}
