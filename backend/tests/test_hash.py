import sqlite3
from pathlib import Path

import pytest
from passlib.context import CryptContext


pwd_context = CryptContext(schemes=['pbkdf2_sha256'], deprecated='auto')


def _load_user_hashes():
    db_path = Path('raglab_pro.db')
    if not db_path.exists():
        pytest.skip('raglab_pro.db nao existe neste ambiente de teste')
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if cursor.fetchone() is None:
            pytest.skip('tabela users nao existe neste banco local')
        cursor.execute('SELECT username, password_hash FROM users')
        return cursor.fetchall()
    finally:
        conn.close()


def test_existing_user_hashes_are_verifiable_when_users_table_exists():
    rows = _load_user_hashes()
    for _username, pw_hash in rows:
        for test_pw in ['admin', 'password', '123456', 'changeme', 'root']:
            try:
                pwd_context.verify(test_pw, pw_hash)
            except Exception as exc:  # pragma: no cover - assertion keeps exact error visible
                raise AssertionError(f'hash invalido para verificacao: {exc}') from exc


def test_password_hash_roundtrip():
    new_hash = pwd_context.hash('testpass123')
    assert pwd_context.verify('testpass123', new_hash)
