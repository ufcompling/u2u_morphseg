# Used Copilot to autofill.
import io

def pdfExtractor(file_content: bytes) -> str:
    """Extracts text from a PDF file given its content."""
    from PyPDF2 import PdfReader # type: ignore
    reader = PdfReader(io.BytesIO(file_content))
    text = ''
    for page in reader.pages:
        text += page.extract_text() + '\n'
    return text

def docxExtractor(file_content: bytes) -> str:
    """Extracts text from a DOCX file given its content."""
    try:
        from docx import Document # type: ignore
        doc = Document(io.BytesIO(file_content))
        text = '\n'.join([para.text for para in doc.paragraphs])
        return text
    except Exception as e:
        print(f"Error extracting text from DOCX: {e}")
        return ""