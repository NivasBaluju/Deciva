import re
from typing import List, Dict, Any

HIGH_RISK_PATTERNS = [
    {
        "pattern": r"(unlimited\s+liability|no\s+cap\s+on\s+liability|liability\s+(?:is\s+)?unlimited)",
        "type": "CONFIRMED_HAZARD_UNLIMITED_LIABILITY",
        "severity": "HIGH",
        "points": 20,
        "reason": "Explicit unlimited liability exposure detected without standard indemnification caps."
    },
    {
        "pattern": r"(automatic(?:ally)?\s+renew(?:s|al)?(?!\s+upon\s+notice)|\bin\s+perpetuity\b)",
        "type": "CONFIRMED_HAZARD_PERPETUAL_BINDING",
        "severity": "MEDIUM",
        "points": 12,
        "reason": "Perpetual duration or automatic renewal lock-in without mandatory prior notice."
    },
    {
        "pattern": r"(sole\s+and\s+absolute\s+discretion|unilateral(?:ly)?\s+modify)",
        "type": "CONFIRMED_HAZARD_UNILATERAL_DISCRETION",
        "severity": "HIGH",
        "points": 15,
        "reason": "Unilateral modification rights granting one party unchecked discretion."
    },
    {
        "pattern": r"(non-refundable|waives?\s+all\s+(?:rights|claims|warranties)|non-?compete.{0,30}(?:years|globally))",
        "type": "CONFIRMED_HAZARD_RIGHTS_WAIVER",
        "severity": "MEDIUM",
        "points": 10,
        "reason": "Broad waiver of claims, onerous non-compete, or statutory warranty protections."
    },
    {
        "pattern": r"(immediate\s+termination|terminat(?:es?|ion)\s+immediately|without\s+(?:cause|notice))",
        "type": "CONFIRMED_HAZARD_ARBITRARY_TERMINATION",
        "severity": "HIGH",
        "points": 15,
        "reason": "Immediate termination without cure period or required default notice."
    },
    {
        "pattern": r"(indemnif(?:y|ies|ication)\s+.*?\bwithout\s+limitation|all\s+claims\s+without\s+limitation)",
        "type": "CONFIRMED_HAZARD_UNLIMITED_INDEMNITY",
        "severity": "HIGH",
        "points": 20,
        "reason": "Uncapped indemnification obligations exposing organization to unlimited third-party claims."
    }
]

def calculate_document_risk(
    full_text: str,
    detected_clauses: List[Dict[str, Any]],
    missing_clauses_info: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Computes a calibrated, explainable risk score (0-100) separating confirmed textual hazards from clause omissions.
    """
    risk_factors = []
    hazard_points = 0
    omission_points = 0

    lower_text = (full_text or "").lower()
    for hazard in HIGH_RISK_PATTERNS:
        if re.search(hazard["pattern"], lower_text, re.IGNORECASE):
            risk_factors.append({
                "riskType": hazard["type"],
                "category": "CONFIRMED_HAZARD",
                "severity": hazard["severity"],
                "reason": hazard["reason"],
                "riskPoints": hazard["points"]
            })
            hazard_points += hazard["points"]

    for missing in missing_clauses_info.get("missing", []):
        risk_factors.append({
            "riskType": f"OMISSION_{missing['type']}",
            "category": "POTENTIAL_OMISSION",
            "severity": missing["severity"],
            "reason": missing["reason"],
            "riskPoints": missing["riskPoints"]
        })
        omission_points += missing["riskPoints"]

    # Confirmed textual hazards carry 100% weight, while unverified omissions carry a moderated ceiling
    moderated_omissions = min(35, omission_points)
    total_raw_points = hazard_points + moderated_omissions

    # Normalize to 0-100 scale (minimum baseline: 5 for clean valid documents)
    normalized_score = min(100, max(5, total_raw_points))

    if normalized_score <= 25:
        level = "LOW"
    elif normalized_score <= 55:
        level = "MEDIUM"
    else:
        level = "HIGH"

    return {
        "score": normalized_score,
        "level": level,
        "totalRiskPoints": total_raw_points,
        "hazardPoints": hazard_points,
        "omissionPoints": omission_points,
        "factors": risk_factors,
        "summary": f"{level} Risk ({normalized_score}/100) identified: {len([f for f in risk_factors if f.get('category') == 'CONFIRMED_HAZARD'])} confirmed hazards, {len([f for f in risk_factors if f.get('category') == 'POTENTIAL_OMISSION'])} potential omissions."
    }
