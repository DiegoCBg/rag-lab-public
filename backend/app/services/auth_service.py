import secrets
import string
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from app.models.auth_token import AuthTokenRevocation
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, ForgotPasswordRequest, LoginRequest, RegisterRequest
from app.services.security import create_access_token, hash_password, verify_password

_PASSWORD_CHARS = string.ascii_letters + string.digits


def _generate_password(length: int = 12) -> str:
    return ''.join(secrets.choice(_PASSWORD_CHARS) for _ in range(length))


class AuthService:
    @staticmethod
    def register(db: Session, payload: RegisterRequest):
        if db.query(User).filter(User.username == payload.username).first():
            raise ValueError('username already exists')
        email = (payload.email or '').strip() or None
        if email:
            existing_email = db.query(User).filter(User.email == email).first()
            if existing_email:
                raise ValueError('email already registered')
        user = User(
            username=payload.username,
            email=email,
            password_hash=hash_password(payload.password),
            is_admin=db.query(User).count() == 0,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    @staticmethod
    def login(db: Session, payload: LoginRequest):
        user = db.query(User).filter(User.username == payload.username).first()
        if not user or not verify_password(payload.password, user.password_hash):
            raise ValueError('invalid credentials')
        if not user.is_active:
            raise ValueError('inactive account')
        token = create_access_token(user.username, extra={'uid': user.id})
        return {'access_token': token, 'token_type': 'bearer'}

    @staticmethod
    def revoke_token(db: Session, token_payload: dict):
        jti = token_payload.get('jti')
        if not jti:
            raise ValueError('token sem jti nao pode ser revogado')
        if db.query(AuthTokenRevocation).filter(AuthTokenRevocation.jti == jti).first():
            return
        expires_at = None
        exp = token_payload.get('exp')
        if isinstance(exp, (int, float)):
            expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
        db.add(AuthTokenRevocation(
            jti=jti,
            subject=token_payload.get('sub'),
            expires_at=expires_at,
        ))
        db.commit()

    @staticmethod
    def change_password(db: Session, user: User, payload: ChangePasswordRequest):
        if not verify_password(payload.current_password, user.password_hash):
            raise ValueError('current password is incorrect')
        user.password_hash = hash_password(payload.new_password)
        db.commit()

    @staticmethod
    def reset_password(db: Session, user: User):
        """Gera uma nova senha e a retorna em texto puro (exibida uma única vez na tela)."""
        new_password = _generate_password()
        user.password_hash = hash_password(new_password)
        db.commit()
        return new_password

    @staticmethod
    def forgot_password(db: Session, payload: ForgotPasswordRequest):
        """Recuperação sem e-mail (uso local / usuário único): gera nova senha e devolve na resposta."""
        user = db.query(User).filter(User.username == payload.username).first()
        if not user:
            raise ValueError('username not found')
        if not user.is_active:
            raise ValueError('inactive account')
        new_password = _generate_password()
        user.password_hash = hash_password(new_password)
        db.commit()
        return {'username': user.username, 'new_password': new_password}
