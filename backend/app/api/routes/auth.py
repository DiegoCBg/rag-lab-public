from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.dependencies.auth import get_current_token_payload, get_current_user
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    MeOut,
    RegisterRequest,
    TokenResponse,
)
from app.services.auth_service import AuthService

router = APIRouter()


@router.post('/register')
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    try:
        user = AuthService.register(db, payload)
        return {'id': user.id, 'username': user.username, 'email': user.email, 'is_admin': user.is_admin}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/login', response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    try:
        return AuthService.login(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.post('/logout')
def logout(token_payload: dict = Depends(get_current_token_payload), db: Session = Depends(get_db)):
    try:
        AuthService.revoke_token(db, token_payload)
        return {'ok': True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get('/me', response_model=MeOut)
def me(current: User = Depends(get_current_user)):
    return current


@router.patch('/me/password')
def change_my_password(
    payload: ChangePasswordRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        AuthService.change_password(db, current, payload)
        return {'ok': True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/forgot-password', response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Usuário único / ambiente local: gera nova senha e devolve na tela."""
    try:
        return AuthService.forgot_password(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
