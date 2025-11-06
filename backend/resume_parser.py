# simple helper: extract text from PDF (if you later add file upload)
from io import BytesIO
import PyPDF2

def extract_text_from_pdf_bytes(pdf_bytes: bytes) -> str:
    reader = PyPDF2.PdfReader(BytesIO(pdf_bytes))
    text = []
    for p in reader.pages:
        text.append(p.extract_text() or "")
    return "\n".join(text)
