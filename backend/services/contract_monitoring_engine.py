"""
Deciva — Continuous Contract Monitoring & Lifecycle Engine (Phase 11)
---------------------------------------------------------------------------
Deterministic, evidence-grounded portfolio monitoring, change detection,
risk delta tracking, and contract lifecycle state evaluation.

Core Architectural Principles:
1. Evidence-First Monitoring: Every event references actual contract text, clause, or stored snapshot.
2. Deterministic Change Detection: Detects clause text changes, liability cap shifts,
   notice period adjustments, governing law modifications, and payment terms with previous & current values.
3. Strict No-Fabrication: If dates or deadlines are absent from evidence, returns NOT_AVAILABLE or UNKNOWN.
4. Deterministic Prioritization: Inspectable weighted priority formula across Severity, Relevance, Urgency, and Magnitude.
5. Idempotent: Repeated evaluation on unchanged contracts produces identical results without duplicates.
"""

import re
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple

NOT_AVAILABLE = "NOT_AVAILABLE"
UNKNOWN = "UNKNOWN"
INSUFFICIENT_DATA = "INSUFFICIENT_HISTORICAL_DATA"

# Severity scoring weights for attention prioritization
SEVERITY_WEIGHTS = {
    "CRITICAL": 95,
    "HIGH": 75,
    "MEDIUM": 50,
    "LOW": 25,
    "INFORMATIONAL": 10
}

RELEVANCE_WEIGHTS = {
    "HIGH": 85,
    "MEDIUM": 50,
    "LOW": 20
}

URGENCY_WEIGHTS = {
    "IMMEDIATE": 95,   # Window open or < 7 days
    "URGENT": 85,      # <= 14 days
    "APPROACHING": 65,  # 15 - 30 days
    "MODERATE": 40,    # 31 - 60 days
    "LOW": 15          # > 60 days or no deadline
}

MAGNITUDE_WEIGHTS = {
    "MAJOR": 90,       # Material liability/jurisdiction/termination shift, or risk delta >= 20
    "MODERATE": 55,    # Notice period change, fee change, or risk delta 10-19
    "MINOR": 25        # Formatting, non-material clarification, risk delta < 10
}

def calculate_attention_priority(
    severity_level: str = "MEDIUM",
    relevance_level: str = "MEDIUM",
    urgency_level: str = "LOW",
    magnitude_level: str = "MODERATE"
) -> Dict[str, Any]:
    """
    Computes deterministic attention priority (0-100) and rank.
    Formula: round(0.35 * S + 0.25 * R + 0.25 * U + 0.15 * M)
    """
    s_val = SEVERITY_WEIGHTS.get(severity_level.upper(), 50)
    r_val = RELEVANCE_WEIGHTS.get(relevance_level.upper(), 50)
    u_val = URGENCY_WEIGHTS.get(urgency_level.upper(), 15)
    m_val = MAGNITUDE_WEIGHTS.get(magnitude_level.upper(), 25)

    raw_score = (0.35 * s_val) + (0.25 * r_val) + (0.25 * u_val) + (0.15 * m_val)
    score = int(min(100, max(0, round(raw_score))))

    if score >= 80:
        rank = "CRITICAL"
    elif score >= 60:
        rank = "HIGH"
    elif score >= 40:
        rank = "MEDIUM"
    elif score >= 20:
        rank = "LOW"
    else:
        rank = "INFORMATIONAL"

    return {
        "priority_score": score,
        "priority_rank": rank,
        "factors": {
            "severity": {"level": severity_level.upper(), "score": s_val, "weight": 0.35},
            "business_relevance": {"level": relevance_level.upper(), "score": r_val, "weight": 0.25},
            "deadline_urgency": {"level": urgency_level.upper(), "score": u_val, "weight": 0.25},
            "change_magnitude": {"level": magnitude_level.upper(), "score": m_val, "weight": 0.15}
        },
        "formula": "round(0.35 * S + 0.25 * R + 0.25 * U + 0.15 * M)"
    }

def calculate_risk_delta(
    previous_score: Optional[int],
    current_score: Optional[int],
    affected_dimension: str = "PORTFOLIO_EXPOSURE",
    contributing_evidence: Optional[str] = None
) -> Dict[str, Any]:
    """
    Computes risk score delta between previous and current evaluation.
    Never manufactures a delta when insufficient evidence exists.
    """
    if previous_score is None:
        return {
            "previous_score": None,
            "current_score": current_score,
            "delta": 0,
            "affected_dimension": affected_dimension,
            "contributing_evidence": contributing_evidence or "Initial contract evaluation — no historical baseline available.",
            "status": INSUFFICIENT_DATA
        }

    c_score = current_score if current_score is not None else 0
    p_score = previous_score
    delta = c_score - p_score

    return {
        "previous_score": p_score,
        "current_score": c_score,
        "delta": delta,
        "affected_dimension": affected_dimension,
        "contributing_evidence": contributing_evidence or f"Evaluated score delta ({delta:+d}) based on contract changes.",
        "status": "CALCULATED"
    }

def extract_numeric_liability_cap(text: str) -> Optional[Tuple[float, str]]:
    """
    Extracts the primary liability cap dollar amount and exact quote.
    """
    patterns = [
        r'(?:liability\s+(?:shall|will|is)?\s*(?:not\s+exceed|be\s+limited\s+to|capped\s+at)\s*(?:\$|USD\s*)([0-9,]+(?:\.[0-9]{2})?))',
        r'(?:maximum\s+aggregate\s+liability\s*(?:shall\s+be|of)\s*(?:\$|USD\s*)([0-9,]+(?:\.[0-9]{2})?))',
        r'(?:aggregate\s+liability\s+(?:under|arising).*?(?:\$|USD\s*)([0-9,]+(?:\.[0-9]{2})?))',
        r'(?:cap\s+of\s*(?:\$|USD\s*)([0-9,]+(?:\.[0-9]{2})?))'
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE | re.DOTALL)
        if m:
            raw_val = m.group(1).replace(',', '')
            try:
                val = float(raw_val)
                start = max(0, m.start() - 20)
                end = min(len(text), m.end() + 20)
                return val, text[start:end].strip()
            except ValueError:
                pass
    return None

def extract_governing_law(text: str) -> Optional[Tuple[str, str]]:
    """
    Extracts governing jurisdiction and surrounding quote.
    """
    pattern = r'(?:governed\s+by(?:\s+and\s+construed\s+in\s+accordance\s+with)?\s+the\s+laws\s+of\s+(?:the\s+State\s+of\s+)?([A-Za-z\s]+?)(?:\.|,|\s+without|\s+and))'
    m = re.search(pattern, text, re.IGNORECASE)
    if m:
        jurisdiction = m.group(1).strip()
        start = max(0, m.start())
        end = min(len(text), m.end() + 30)
        return jurisdiction, text[start:end].strip()
    return None

def extract_payment_terms(text: str) -> Optional[Tuple[str, str]]:
    """
    Extracts payment term (e.g. Net 30, Net 60, within 45 days) and quote.
    """
    m = re.search(r'(?:(?:Net\s*(?:15|30|45|60|90))|(?:within\s+(?:15|30|45|60|90)\s+(?:calendar\s+)?days\s+of\s+(?:receipt\s+of\s+)?invoice))', text, re.IGNORECASE)
    if m:
        term = m.group(0).strip()
        start = max(0, m.start() - 15)
        end = min(len(text), m.end() + 20)
        return term, text[start:end].strip()
    return None

def extract_notice_period_days(text: str) -> Optional[Tuple[int, str]]:
    """
    Extracts termination or renewal notice window in days.
    """
    patterns = [
        r'(?:written\s+notice\s+(?:of\s+at\s+least|at\s+least|not\s+less\s+than)\s*([0-9]+)\s*(?:business\s+|calendar\s+)?days)',
        r'(?:notice\s+(?:period\s+of|prior\s+to\s+renewal\s+of)\s*([0-9]+)\s*days)',
        r'(?:prior\s+written\s+notice\s+of\s*([0-9]+)\s*days)'
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                days = int(m.group(1))
                start = max(0, m.start() - 10)
                end = min(len(text), m.end() + 25)
                return days, text[start:end].strip()
            except ValueError:
                pass
    return None

def extract_cure_period_days(text: str) -> Optional[Tuple[int, str]]:
    """
    Extracts cure period in days for material breach.
    """
    patterns = [
        r'(?:cure\s+(?:such\s+)?(?:breach|default)\s+within\s*([0-9]+)\s*(?:business\s+|calendar\s+)?days)',
        r'(?:within\s*([0-9]+)\s*days\s+(?:of|after)\s+(?:written\s+)?notice\s+to\s+cure)',
        r'(?:cure\s+period\s+of\s*([0-9]+)\s*days)'
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            try:
                days = int(m.group(1))
                start = max(0, m.start() - 10)
                end = min(len(text), m.end() + 25)
                return days, text[start:end].strip()
            except ValueError:
                pass
    return None

def detect_contract_changes(
    prev_text: Optional[str],
    curr_text: str,
    prev_intelligence: Optional[Dict[str, Any]] = None,
    curr_intelligence: Optional[Dict[str, Any]] = None,
    document_id: str = ""
) -> List[Dict[str, Any]]:
    """
    Deterministic comparison between previous and current contract text/intelligence.
    Identifies clause modifications, numeric shifts, date alterations, governing law changes,
    and payment terms.
    """
    changes: List[Dict[str, Any]] = []

    if not prev_text and not prev_intelligence:
        # First snapshot — no historical baseline
        return changes

    prev_t = prev_text or ""
    curr_t = curr_text or ""

    prev_cap_info = extract_numeric_liability_cap(prev_t)
    curr_cap_info = extract_numeric_liability_cap(curr_t)
    if prev_cap_info and curr_cap_info:
        prev_val, prev_quote = prev_cap_info
        curr_val, curr_quote = curr_cap_info
        if prev_val != curr_val:
            # If liability cap decreased or eliminated, risk increases!
            cap_diff = curr_val - prev_val
            risk_delta = -15 if cap_diff > 0 else 25 # lowering liability protection increases risk
            severity = "CRITICAL" if curr_val < prev_val else "MEDIUM"
            changes.append({
                "document_id": document_id,
                "event_type": "LIABILITY_CHANGE",
                "severity": severity,
                "field": "liability_cap",
                "previous_value": f"${prev_val:,.2f}",
                "current_value": f"${curr_val:,.2f}",
                "title": f"Liability Cap Modified from ${prev_val:,.0f} to ${curr_val:,.0f}",
                "description": f"Contractual aggregate liability cap shifted from ${prev_val:,.2f} to ${curr_val:,.2f}.",
                "evidence_reference": curr_quote,
                "affected_dimension": "LIABILITY_LIMIT",
                "risk_delta": risk_delta,
                "deduplication_key": f"change_liability_cap_{int(prev_val)}_{int(curr_val)}"
            })
    elif not prev_cap_info and curr_cap_info:
        curr_val, curr_quote = curr_cap_info
        changes.append({
            "document_id": document_id,
            "event_type": "LIABILITY_CHANGE",
            "severity": "LOW",
            "field": "liability_cap",
            "previous_value": NOT_AVAILABLE,
            "current_value": f"${curr_val:,.2f}",
            "title": f"Explicit Liability Cap Introduced: ${curr_val:,.0f}",
            "description": f"A defined liability cap of ${curr_val:,.2f} was added to the contract.",
            "evidence_reference": curr_quote,
            "affected_dimension": "LIABILITY_LIMIT",
            "risk_delta": -10,
            "deduplication_key": f"change_liability_cap_added_{int(curr_val)}"
        })
    elif prev_cap_info and not curr_cap_info:
        prev_val, prev_quote = prev_cap_info
        changes.append({
            "document_id": document_id,
            "event_type": "LIABILITY_CHANGE",
            "severity": "CRITICAL",
            "field": "liability_cap",
            "previous_value": f"${prev_val:,.2f}",
            "current_value": NOT_AVAILABLE,
            "title": "Liability Cap Removed (Unlimited Exposure)",
            "description": "Previous liability limitation was removed, creating potential uncapped liability.",
            "evidence_reference": "Previous: " + prev_quote,
            "affected_dimension": "LIABILITY_LIMIT",
            "risk_delta": 30,
            "deduplication_key": "change_liability_cap_removed"
        })

    prev_law = extract_governing_law(prev_t)
    curr_law = extract_governing_law(curr_t)
    if prev_law and curr_law:
        p_jur, p_quote = prev_law
        c_jur, c_quote = curr_law
        if p_jur.lower() != c_jur.lower():
            changes.append({
                "document_id": document_id,
                "event_type": "GOVERNING_LAW_CHANGE",
                "severity": "HIGH",
                "field": "governing_law",
                "previous_value": p_jur,
                "current_value": c_jur,
                "title": f"Governing Law Changed: {p_jur} → {c_jur}",
                "description": f"Governing jurisdiction amended from {p_jur} to {c_jur}.",
                "evidence_reference": c_quote,
                "affected_dimension": "JURISDICTION_LAW",
                "risk_delta": 15,
                "deduplication_key": f"change_gov_law_{p_jur.lower()}_{c_jur.lower()}"
            })

    prev_pay = extract_payment_terms(prev_t)
    curr_pay = extract_payment_terms(curr_t)
    if prev_pay and curr_pay:
        p_term, p_quote = prev_pay
        c_term, c_quote = curr_pay
        if p_term.lower() != c_term.lower():
            changes.append({
                "document_id": document_id,
                "event_type": "PAYMENT_TERM_CHANGE",
                "severity": "MEDIUM",
                "field": "payment_terms",
                "previous_value": p_term,
                "current_value": c_term,
                "title": f"Payment Terms Modified: {p_term} → {c_term}",
                "description": f"Contractual settlement window updated from {p_term} to {c_term}.",
                "evidence_reference": c_quote,
                "affected_dimension": "PAYMENT_OBLIGATION",
                "risk_delta": 5,
                "deduplication_key": f"change_payment_{p_term.lower()}_{c_term.lower()}"
            })

    prev_notice = extract_notice_period_days(prev_t)
    curr_notice = extract_notice_period_days(curr_t)
    if prev_notice and curr_notice:
        p_days, p_quote = prev_notice
        c_days, c_quote = curr_notice
        if p_days != c_days:
            # Notice period shortening can be high risk
            risk_delta = 15 if c_days < p_days else -5
            severity = "HIGH" if c_days < p_days else "LOW"
            changes.append({
                "document_id": document_id,
                "event_type": "NOTICE_DEADLINE_APPROACHING" if c_days < p_days else "CONTRACT_CHANGED",
                "severity": severity,
                "field": "notice_period",
                "previous_value": f"{p_days} days",
                "current_value": f"{c_days} days",
                "title": f"Notice Window Adjusted: {p_days} days → {c_days} days",
                "description": f"Contract notice requirement modified from {p_days} days to {c_days} days.",
                "evidence_reference": c_quote,
                "affected_dimension": "TERMINATION_RIGHTS",
                "risk_delta": risk_delta,
                "deduplication_key": f"change_notice_days_{p_days}_{c_days}"
            })

    if prev_intelligence and curr_intelligence:
        prev_exp = (
            prev_intelligence.get("exposure_score") or
            prev_intelligence.get("exposureScore") or
            prev_intelligence.get("health_score") or
            prev_intelligence.get("healthScore") or 0
        )
        curr_exp = (
            curr_intelligence.get("exposure_score") or
            curr_intelligence.get("exposureScore") or
            curr_intelligence.get("health_score") or
            curr_intelligence.get("healthScore") or 0
        )
        diff = curr_exp - prev_exp
        if abs(diff) >= 10:
            is_increase = diff > 0
            event_type = "RISK_INCREASED" if is_increase else "RISK_DECREASED"
            sev = "CRITICAL" if diff >= 20 else ("HIGH" if diff >= 10 else "INFORMATIONAL")
            changes.append({
                "document_id": document_id,
                "event_type": event_type,
                "severity": sev,
                "field": "exposure_score",
                "previous_value": str(prev_exp),
                "current_value": str(curr_exp),
                "title": f"Contract Exposure {'Surged' if diff >= 20 else 'Increased'} by {diff:+d} Points" if is_increase else f"Contract Exposure Decreased by {abs(diff)} Points",
                "description": f"Contract exposure score moved from {prev_exp} to {curr_exp} ({diff:+d}).",
                "evidence_reference": curr_intelligence.get("primaryDriver") or "Re-evaluated contract intelligence baseline.",
                "affected_dimension": "COMPREHENSIVE_RISK",
                "risk_delta": diff,
                "deduplication_key": f"change_risk_score_{prev_exp}_{curr_exp}"
            })

    return changes

def evaluate_lifecycle_events(
    document_id: str,
    text: str,
    now: Optional[datetime] = None,
    explicit_metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Evaluates evidence-grounded contract lifecycle states and deadlines.
    Strictly adheres to the No-Fabrication principle:
    If dates are missing in the contract text, returns NOT_AVAILABLE or UNKNOWN.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    # Search for explicit expiration date
    expiration_date: Optional[datetime] = None
    expiration_quote: Optional[str] = None

    date_patterns = [
        r'(?:expires?\s+on|expiration\s+date\s*(?:is|:)?|shall\s+terminate\s+on|term\s+ends\s+on)\s*([A-Za-z]+\s+[0-9]{1,2},?\s+[0-9]{4}|[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})',
        r'(?:effective\s+until)\s*([A-Za-z]+\s+[0-9]{1,2},?\s+[0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})'
    ]

    for pat in date_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            raw_date = m.group(1).strip()
            # Attempt to parse common formats
            for fmt in ("%B %d, %Y", "%B %d %Y", "%m/%d/%Y", "%Y-%m-%d", "%d-%m-%Y"):
                try:
                    dt = datetime.strptime(raw_date, fmt).replace(tzinfo=timezone.utc)
                    expiration_date = dt
                    start = max(0, m.start() - 10)
                    end = min(len(text), m.end() + 20)
                    expiration_quote = text[start:end].strip()
                    break
                except ValueError:
                    continue
            if expiration_date:
                break

    # Notice period extraction
    notice_info = extract_notice_period_days(text)
    notice_days = notice_info[0] if notice_info else None
    notice_quote = notice_info[1] if notice_info else None

    # Cure period extraction
    cure_info = extract_cure_period_days(text)
    cure_days = cure_info[0] if cure_info else None
    cure_quote = cure_info[1] if cure_info else None

    # Auto-renewal clause detection
    auto_renew = False
    renewal_quote: Optional[str] = None
    m_renew = re.search(r'(?:automatic(?:ally)?\s+renew(?:al|s)?|successive\s+(?:terms?|periods?)\s+of\s*[0-9]+\s*(?:year|month)s?)', text, re.IGNORECASE)
    if m_renew:
        auto_renew = True
        start = max(0, m_renew.start() - 15)
        end = min(len(text), m_renew.end() + 35)
        renewal_quote = text[start:end].strip()

    # Calculate notice deadline if expiration and notice days are known
    notice_deadline: Optional[datetime] = None
    if expiration_date and notice_days is not None:
        notice_deadline = expiration_date - timedelta(days=notice_days)

    # Calculate cure deadline if breached (only if explicitly flagged in metadata)
    cure_deadline: Optional[datetime] = None
    if explicit_metadata and explicit_metadata.get("breach_notice_date") and cure_days:
        try:
            b_dt = datetime.fromisoformat(explicit_metadata["breach_notice_date"]).replace(tzinfo=timezone.utc)
            cure_deadline = b_dt + timedelta(days=cure_days)
        except Exception:
            pass

    # Renewal date equals expiration date for auto-renewing agreements
    renewal_date = expiration_date if auto_renew else None

    # Determine Lifecycle State deterministically
    state = "UNKNOWN"
    reason = "Contract does not contain sufficient dates or renewal provisions."

    if expiration_date:
        days_to_expiration = (expiration_date - now).total_seconds() / 86400.0

        if days_to_expiration < 0:
            state = "EXPIRED"
            reason = f"Contract passed expiration date ({expiration_date.strftime('%Y-%m-%d')})."
        elif notice_deadline:
            days_to_notice = (notice_deadline - now).total_seconds() / 86400.0
            if days_to_notice < 0 and days_to_expiration > 0:
                # Notice window passed or is currently open
                state = "NOTICE_WINDOW_OPEN"
                reason = f"Contract is within the mandatory {notice_days}-day non-renewal notice window."
            elif days_to_notice <= 30:
                state = "RENEWAL_APPROACHING"
                reason = f"Notice deadline ({notice_deadline.strftime('%Y-%m-%d')}) approaches in {int(days_to_notice)} days."
            else:
                state = "ACTIVE"
                reason = "Contract is in active term outside critical notice windows."
        elif days_to_expiration <= 60:
            state = "RENEWAL_APPROACHING"
            reason = f"Contract expiration approaches in {int(days_to_expiration)} days."
        else:
            state = "ACTIVE"
            reason = "Contract is in active term."
    else:
        # Check if contract has active obligations without explicit termination date
        if "agreement" in text.lower() or "terms" in text.lower():
            state = "ACTIVE"
            reason = "Contract language indicates ongoing operational agreement; specific expiration date NOT_AVAILABLE."

    return {
        "document_id": document_id,
        "state": state,
        "renewal_date": renewal_date.isoformat() if renewal_date else NOT_AVAILABLE,
        "notice_deadline": notice_deadline.isoformat() if notice_deadline else NOT_AVAILABLE,
        "cure_deadline": cure_deadline.isoformat() if cure_deadline else NOT_AVAILABLE,
        "expiration_date": expiration_date.isoformat() if expiration_date else NOT_AVAILABLE,
        "lifecycle_reason": reason,
        "evidence": {
            "expiration_evidence": expiration_quote or NOT_AVAILABLE,
            "renewal_evidence": renewal_quote or NOT_AVAILABLE,
            "notice_evidence": notice_quote or NOT_AVAILABLE,
            "cure_evidence": cure_quote or NOT_AVAILABLE,
            "auto_renew": auto_renew,
            "notice_period_days": notice_days if notice_days is not None else NOT_AVAILABLE,
            "cure_period_days": cure_days if cure_days is not None else NOT_AVAILABLE
        }
    }
