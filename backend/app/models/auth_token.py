from sqlalchemy import Column, DateTime, Integer, String, func

from app.db.session import Base


class AuthTokenRevocation(Base):
    __tablename__ = 'auth_token_revocations'

    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String(80), nullable=False, unique=True, index=True)
    subject = Column(String(120), nullable=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
