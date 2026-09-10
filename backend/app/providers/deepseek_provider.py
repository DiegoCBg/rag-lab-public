from app.providers.openai_provider import OpenAIProvider


class DeepSeekProvider(OpenAIProvider):
    endpoint = 'https://api.deepseek.com/chat/completions'
