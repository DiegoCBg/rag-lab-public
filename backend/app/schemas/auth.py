from pydantic import BaseModel, ConfigDict, Field

class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)
    email: str | None = None

class LoginRequest(BaseModel):
    username: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)

class MeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str | None = None
    is_active: bool
    is_admin: bool

class ForgotPasswordRequest(BaseModel):
    username: str

class ForgotPasswordResponse(BaseModel):
    username: str
    new_password: str
    note: str = 'Mostrada uma única vez'

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'