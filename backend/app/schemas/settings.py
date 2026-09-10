from pydantic import BaseModel, Field

class SettingsItem(BaseModel):
    key: str
    value: str = ''
    is_set: bool = False
    is_secret: bool = False
    source: str = 'env'

class SettingsPatchRequest(BaseModel):
    items: dict[str, str | None] = Field(default_factory=dict)

class SettingsPatchResponse(BaseModel):
    items: list[SettingsItem] = []