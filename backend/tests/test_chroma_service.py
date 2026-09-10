from app.services.chroma_service import ChromaService


def test_chroma_service_uses_http_client_only(monkeypatch):
    calls = {'http': 0, 'persistent': 0}

    class FakeClient:
        def heartbeat(self):
            return 1

        def get_collection(self, name):
            raise Exception('Collection does not exist')

    def fake_http_client(*args, **kwargs):
        calls['http'] += 1
        return FakeClient()

    def fake_persistent_client(*args, **kwargs):
        calls['persistent'] += 1
        raise AssertionError('PersistentClient must not be used by FastAPI')

    ChromaService.reset_client()
    monkeypatch.setattr('app.services.chroma_service.chromadb.HttpClient', fake_http_client)
    monkeypatch.setattr('app.services.chroma_service.chromadb.PersistentClient', fake_persistent_client)

    assert ChromaService.heartbeat() is True
    assert ChromaService.safe_count() == 0
    assert calls == {'http': 1, 'persistent': 0}
    ChromaService.reset_client()
