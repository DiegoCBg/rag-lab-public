from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.user import (
    ResetPasswordResponse,
    UserCreateRequest,
    UserOut,
    UserUpdateRequest,
)
from app.services.auth_service import AuthService
from app.services.security import hash_password

router = APIRouter(prefix='/admin/users', tags=['admin-users'])


@router.get('', response_model=list[UserOut])
def list_users(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(User).order_by(User.id).all()


@router.post('', response_model=UserOut, status_code=201)
def create_user(payload: UserCreateRequest, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=400, detail='username already exists')
    if payload.email:
        if db.query(User).filter(User.email == payload.email).first():
            raise HTTPException(status_code=400, detail='email already registered')
    user = User(
        username=payload.username,
        email=(payload.email or '').strip() or None,
        password_hash=hash_password(payload.password),
        is_admin=payload.is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch('/{user_id}', response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='user not found')
    if payload.is_active is False and user.id == current.id:
        raise HTTPException(status_code=400, detail='cannot deactivate yourself')
    if payload.is_admin is False and user.is_admin and user.id == current.id:
        raise HTTPException(status_code=400, detail='cannot remove your own admin role')
    if payload.username is not None:
        new_username = payload.username.strip()
        if not new_username:
            raise HTTPException(status_code=400, detail='username cannot be empty')
        dup = db.query(User).filter(User.username == new_username, User.id != user.id).first()
        if dup:
            raise HTTPException(status_code=400, detail='username already exists')
        user.username = new_username
    if payload.email is not None:
        email = payload.email.strip() or None
        dup = db.query(User).filter(User.email == email, User.id != user.id).first() if email else None
        if dup:
            raise HTTPException(status_code=400, detail='email already registered')
        user.email = email
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.is_admin is not None:
        user.is_admin = payload.is_admin
    db.commit()
    db.refresh(user)
    return user


@router.delete('/{user_id}')
def delete_user(user_id: int, current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='user not found')
    if user.id == current.id:
        raise HTTPException(status_code=400, detail='cannot delete yourself')
    admins = db.query(User).filter(User.is_admin == True).count()  # noqa: E712
    if user.is_admin and admins <= 1:
        raise HTTPException(status_code=400, detail='cannot delete the last admin')
    db.delete(user)
    db.commit()
    return {'ok': True}


@router.post('/{user_id}/reset-password', response_model=ResetPasswordResponse)
def reset_user_password(user_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail='user not found')
    new_password = AuthService.reset_password(db, user)
    return {
        'username': user.username,
        'new_password': new_password,
        'note': 'Mostrada uma única vez — guarde-a antes de fechar.',
    }