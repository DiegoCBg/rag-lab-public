import re
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class DocumentScopeRequest(BaseModel):
    document_scope: Literal['all', 'selected'] = 'all'
    document_ids: list[str] = Field(default_factory=list)

    @model_validator(mode='before')
    @classmethod
    def normalize_document_scope(cls, values):
        if not isinstance(values, dict):
            return values
        values = dict(values)
        raw = values.get('document_ids')
        if raw is None:
            raw = []
        if not isinstance(raw, list):
            raise ValueError('document_ids deve ser uma lista.')
        ids = []
        for value in raw:
            if isinstance(value, bool) or not isinstance(value, (str, int)):
                raise ValueError('IDs devem ser inteiros positivos.')
            if not re.fullmatch(r'[0-9]+', str(value)) or int(value) <= 0:
                raise ValueError('IDs devem ser inteiros positivos.')
            normalized = str(int(value))
            if normalized not in ids:
                ids.append(normalized)
        mode = values.get('document_scope', 'selected' if ids else 'all')
        if mode == 'selected' and not ids:
            raise ValueError('Selecione pelo menos um documento.')
        if mode == 'all' and ids:
            raise ValueError('O modo all nao aceita IDs selecionados.')
        values.update(document_scope=mode, document_ids=ids)
        return values
