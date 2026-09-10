from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

class UserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: Optional[str] = None
    password: str = Field(min_length=6, max_length=128)
    is_admin: bool = False

class UserUpdateRequest(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=64)
    email: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=6, max_length=128)
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None

class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    is_active: bool
    is_admin: bool
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class ResetPasswordResponse(BaseModel):
    username: str
    new_password: str
    note: str = 'Mostrada uma única vez'
