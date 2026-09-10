from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.auth_token import AuthTokenRevocation
from app.models.user import User
from app.services.security import decode_access_token

security = HTTPBearer(auto_error=False)


def _decode_token(credentials: HTTPAuthorizationCredentials) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail='missing token')
    try:
        payload = decode_access_token(credentials.credentials)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail='invalid token') from exc
    subject = payload.get('sub')
    if not subject:
        raise HTTPException(status_code=401, detail='invalid token')
    return payload


def get_current_token_payload(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> dict:
    payload = _decode_token(credentials)
    jti = payload.get('jti')
    if not jti:
        raise HTTPException(status_code=401, detail='token without jti')
    if db.query(AuthTokenRevocation).filter(AuthTokenRevocation.jti == jti).first():
        raise HTTPException(status_code=401, detail='revoked token')
    return payload


def get_current_user(token_payload: dict = Depends(get_current_token_payload), db: Session = Depends(get_db)):
    subject = token_payload.get('sub')
    if subject.startswith('id:'):
        user = db.query(User).filter(User.id == int(subject[3:])).first()
    else:
        user = db.query(User).filter(User.username == subject).first()
    if not user:
        raise HTTPException(status_code=401, detail='user not found')
    if not user.is_active:
        raise HTTPException(status_code=403, detail='inactive account')
    return user


def require_admin(current: User = Depends(get_current_user)):
    if not current.is_admin:
        raise HTTPException(status_code=403, detail='admin privileges required')
    return current
