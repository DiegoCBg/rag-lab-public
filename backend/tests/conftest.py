"""Configuração global do pytest para backend/tests/.

Injeta 'backend/' no sys.path para que imports como
`from app.db.base import Base` funcionem corretamente.
"""

import sys
from pathlib import Path as _Path

import pytest

# Injetar o diretório raiz do backend no PYTHONPATH.
_backend_root = _Path(__file__).resolve().parent.parent
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

# Também adicionar 'app/' como subpacote para imports aninhados
_app_dir = _backend_root / "app"
if str(_app_dir) not in sys.path:
    # Não precisamos injetar 'app/', apenas garantir que o pacote 'app' é visível
    pass


@pytest.fixture(autouse=True)
def _reset_runtime_settings():
    from app.services import runtime_settings
    """Isola o cache em memória de config entre testes."""
    yield
    runtime_settings.refresh({})
