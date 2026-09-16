import re
import uuid
from typing import List, Dict, Any

HEADING_PATTERN = re.compile(
    r'(?:^|\n\n+)'
    r'(?:'
    r'(\d+[\.\)]\s+[A-Z0-9\s\-_/]{3,60})|'                       # e.g., "1. TERM", "2) PAYMENT"
    r'((?:ARTICLE|SECTION|CLAUSE)\s+[0-9IVXLCDM]+[\.\:]?\s*[A-Z0-9\s\-_/]*)|' # e.g., "ARTICLE III", "SECTION 4.1"
    r'([A-Z\s\-_/]{4,50}:)|'                                     # e.g., "CONFIDENTIALITY:"
    r'([A-Z0-9\s\-_/]{4,50}\n[-=]{3,})'                          # e.g. "HEADER\n---"
    r')',
    re.IGNORECASE | re.MULTILINE
)

def segment_document(document_text: str) -> List[Dict[str, Any]]:
    """
    Splits document text into structured legal segments with extracted titles and position.
    """
    if not document_text or not document_text.strip():
        return []

    text = document_text.replace('\r\n', '\n').strip()
    
    split_matches = list(HEADING_PATTERN.finditer(text))
    
    segments = []
    
    if len(split_matches) >= 2:
        # We found explicit structured legal headings
        for i, match in enumerate(split_matches):
            start = match.start()
            end = split_matches[i + 1].start() if i + 1 < len(split_matches) else len(text)
            chunk = text[start:end].strip()
            
            raw_title = match.group(0).strip()
            # Clean title
            title = re.sub(r'[\r\n]+', ' ', raw_title).strip()
            if len(title) > 60:
                title = title[:60] + "..."

            # Body text without title line
            lines = chunk.split('\n')
            body_text = "\n".join(lines[1:]).strip() if len(lines) > 1 else chunk

            segments.append({
                "id": str(uuid.uuid4()),
                "position": i + 1,
                "title": title or f"Section {i + 1}",
                "text": body_text or chunk
            })
    else:
        # Fallback: Split by double newlines (paragraphs)
        raw_paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
        for i, para in enumerate(raw_paragraphs):
            # Try to identify first line as title if short and distinct
            lines = para.split('\n')
            first_line = lines[0].strip()
            if len(first_line) < 50 and (first_line.isupper() or any(c.isdigit() for c in first_line[:4])):
                title = first_line
                body = "\n".join(lines[1:]).strip() or para
            else:
                title = f"Paragraph {i + 1}"
                body = para

            segments.append({
                "id": str(uuid.uuid4()),
                "position": i + 1,
                "title": title,
                "text": body
            })

    return segments
