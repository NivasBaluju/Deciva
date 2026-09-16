import re
from datetime import datetime
from typing import List, Dict, Any

MONTH_MAP = {
    'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
    'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6,
    'jul': 7, 'july': 7, 'aug': 8, 'august': 8, 'sep': 9, 'september': 9,
    'oct': 10, 'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12
}

# Regex for explicit dates (e.g. August 15, 2026, 15 August 2026, 2026-08-15)
EXPLICIT_DATE_PATTERNS = [
    # August 15, 2026 or Aug 15th 2026
    re.compile(r'\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b', re.IGNORECASE),
    # 15 August 2026
    re.compile(r'\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec),?\s+(\d{4})\b', re.IGNORECASE),
    # 2026-08-15 or 2026/08/15
    re.compile(r'\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b')
]

# Regex for relative deadlines (e.g. within 30 days, 60 days prior notice)
RELATIVE_DEADLINE_PATTERN = re.compile(
    r'\b(?:within|prior to|no later than|within a period of|at least)\s+(\d{1,3}\s+(?:business\s+)?(?:days|weeks|months|years))\b',
    re.IGNORECASE
)

def _classify_deadline_type(context: str) -> str:
    ctx = context.lower()
    if any(k in ctx for k in ['expire', 'expiration', 'terminate', 'termination date', 'conclude']):
        return "EXPIRATION"
    if any(k in ctx for k in ['pay', 'payment', 'invoice', 'remit', 'fee', 'rent']):
        return "PAYMENT_DUE"
    if any(k in ctx for k in ['notice', 'written notice', 'cure', 'default']):
        return "NOTICE_PERIOD"
    if any(k in ctx for k in ['renew', 'renewal', 'extension', 'option']):
        return "RENEWAL_DEADLINE"
    if any(k in ctx for k in ['commence', 'effective date', 'commencement', 'start']):
        return "EFFECTIVE_DATE"
    return "CONTRACT_MILESTONE"

def extract_deadlines_from_text(document_text: str) -> List[Dict[str, Any]]:
    """
    Extracts both explicit calendar dates and relative deadlines with context classification.
    """
    if not document_text:
        return []

    deadlines = []
    seen = set()

    sentences = re.split(r'(?<=[.!?\n])\s+', document_text)

    for sentence in sentences:
        sentence_clean = sentence.strip()
        if len(sentence_clean) < 10:
            continue

        for pattern in EXPLICIT_DATE_PATTERNS:
            for match in pattern.finditer(sentence_clean):
                groups = match.groups()
                iso_date = None
                try:
                    if len(groups) == 3:
                        # Month Day Year
                        if groups[0].lower() in MONTH_MAP:
                            m = MONTH_MAP[groups[0].lower()]
                            d = int(groups[1])
                            y = int(groups[2])
                            iso_date = f"{y:04d}-{m:02d}-{d:02d}"
                        # Day Month Year
                        elif groups[1].lower() in MONTH_MAP:
                            d = int(groups[0])
                            m = MONTH_MAP[groups[1].lower()]
                            y = int(groups[2])
                            iso_date = f"{y:04d}-{m:02d}-{d:02d}"
                        # YYYY-MM-DD
                        else:
                            y = int(groups[0])
                            m = int(groups[1])
                            d = int(groups[2])
                            iso_date = f"{y:04d}-{m:02d}-{d:02d}"
                except Exception:
                    pass

                if iso_date and iso_date not in seen:
                    seen.add(iso_date)
                    d_type = _classify_deadline_type(sentence_clean)
                    snippet = sentence_clean[:180].strip()
                    deadlines.append({
                        "deadlineDate": iso_date,
                        "relativeDeadline": None,
                        "deadlineType": d_type,
                        "sourceText": snippet,
                        "confidence": None,
                        "confidenceMethodology": "deterministic_pattern_match"
                    })

        for rel_match in RELATIVE_DEADLINE_PATTERN.finditer(sentence_clean):
            rel_text = rel_match.group(1).strip()
            if rel_text and rel_text not in seen:
                seen.add(rel_text)
                d_type = _classify_deadline_type(sentence_clean)
                snippet = sentence_clean[:180].strip()
                deadlines.append({
                    "deadlineDate": None,
                    "relativeDeadline": rel_text,
                    "deadlineType": d_type,
                    "sourceText": snippet,
                    "confidence": None,
                    "confidenceMethodology": "deterministic_pattern_match"
                })

    return deadlines
