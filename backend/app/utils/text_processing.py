from pathlib import Path
from pypdf import PdfReader


def extract_text(file_path: str) -> str:
    path = Path(file_path)
    suffix = path.suffix.lower()
    if suffix in {'.txt', '.md'}:
        return path.read_text(encoding='utf-8', errors='ignore')
    if suffix == '.pdf':
        reader = PdfReader(str(path))
        texts = []
        for page in reader.pages:
            texts.append(page.extract_text() or '')
        return '\n'.join(texts)
    return path.read_text(encoding='utf-8', errors='ignore')


def chunk_text(text: str, chunk_size: int = 700, overlap: int = 120) -> list[str]:
    normalized = ' '.join(text.split())
    if not normalized:
        return []
    chunks = []
    start = 0
    while start < len(normalized):
        end = start + chunk_size
        chunks.append(normalized[start:end])
        if end >= len(normalized):
            break
        start = max(end - overlap, start + 1)
    return chunks
