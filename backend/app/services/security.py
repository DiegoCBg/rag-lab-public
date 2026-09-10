import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=['pbkdf2_sha256'], deprecated='auto')


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, extra: dict | None = None) -> str:
    issued_at = datetime.now(timezone.utc)
    expire = issued_at + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {'sub': subject, 'exp': expire, 'iat': issued_at, 'jti': uuid.uuid4().hex}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm='HS256')


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=['HS256'])
