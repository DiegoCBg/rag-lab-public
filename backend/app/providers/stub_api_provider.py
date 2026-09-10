from app.providers.base import ChatProvider

class StubAPIProvider(ChatProvider):
    def __init__(self, name: str):
        self.name = name

    async def chat(self, prompt: str) -> str:
        return f'[{self.name}] placeholder response for: {prompt[:120]}'
