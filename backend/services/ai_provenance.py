"""
Deciva — Standard AI Provenance Normalizer (Python)
---------------------------------------------------------------------------
Enforces truthful, auditable AI metadata across all Python services.

CORE RULES:
1. A number is NOT confidence merely because we call it confidence.
2. LLM confidence is only populated if genuinely calibrated and emitted by the provider;
   otherwise {"score": None, "methodology": "not_available"}.
3. Retrieval similarity is represented as retrieval_score / retrieval_methodology,
   NEVER relabeled as confidence.score.
4. Deterministic fallbacks must identify engine = "deterministic", provider = None, model = None.
5. Secret keys/credentials must NEVER appear in provenance metadata.
"""

import os
import re
from typing import Optional, List, Dict, Any

MODEL_NAME_REGEX = re.compile(r"^[a-zA-Z0-9][-._a-zA-Z0-9]{2,63}$")


def get_gemini_api_key() -> Optional[str]:
    """Single source of truth for Gemini API Key resolution in Python."""
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if key and key.strip():
        return key.strip()
    return None


def get_active_gemini_model() -> str:
    """Returns the currently configured external Gemini model name with strict validation."""
    raw = os.getenv("GEMINI_MODEL")
    if not raw or not raw.strip():
        return "gemini-1.5-flash"
    trimmed = raw.strip()
    if not MODEL_NAME_REGEX.match(trimmed):
        # Strict syntax validation: invalid syntax safely falls back to canonical default
        return "gemini-1.5-flash"
    return trimmed


def create_provenance(
    engine: str = "deterministic",
    provider: Optional[str] = None,
    model: Optional[str] = None,
    grounded: bool = False,
    confidence_score: Optional[float] = None,
    confidence_methodology: str = "not_available",
    retrieval_score: Optional[float] = None,
    retrieval_methodology: Optional[str] = None,
    evidence: Optional[List[Any]] = None,
    fallback: bool = False,
) -> Dict[str, Any]:
    """Creates a normalized AI provenance dictionary."""
    valid_engines = {"llm", "deterministic", "hybrid"}
    normalized_engine = engine if engine in valid_engines else "deterministic"

    sanitized_evidence = []
    if isinstance(evidence, list):
        for item in evidence:
            if isinstance(item, str):
                sanitized_evidence.append({"text": item[:500]})
            elif isinstance(item, dict):
                doc_id = item.get("document_id") or item.get("documentId")
                page = item.get("page") if "page" in item else item.get("pageRef")
                seg_id = item.get("segment_id") or item.get("segmentId")
                text = item.get("text", "")
                sim = item.get("similarity") if "similarity" in item else item.get("score")
                
                sanitized_evidence.append({
                    "document_id": doc_id,
                    "page": page,
                    "segment_id": seg_id,
                    "text": text[:500] if isinstance(text, str) else "",
                    "similarity": round(float(sim), 4) if isinstance(sim, (int, float)) else None
                })

    is_grounded = bool(grounded and len(sanitized_evidence) > 0)

    score_val = None
    if isinstance(confidence_score, (int, float)):
        score_val = float(confidence_score)

    retrieval_val = None
    if isinstance(retrieval_score, (int, float)):
        retrieval_val = round(float(retrieval_score), 4)

    return {
        "engine": normalized_engine,
        "provider": None if normalized_engine == "deterministic" else (provider or "gemini"),
        "model": None if normalized_engine == "deterministic" else (model or get_active_gemini_model()),
        "grounded": is_grounded,
        "confidence": {
            "score": score_val,
            "methodology": confidence_methodology or ("calibrated_model_score" if score_val is not None else "not_available")
        },
        "retrieval_score": retrieval_val,
        "retrieval_methodology": retrieval_methodology or ("cosine_similarity" if retrieval_val is not None else None),
        "evidence": sanitized_evidence,
        "fallback": bool(fallback)
    }


def create_deterministic_provenance(
    methodology: str = "deterministic_rule_based",
    evidence: Optional[List[Any]] = None,
    fallback: bool = False,
    retrieval_score: Optional[float] = None,
    retrieval_methodology: Optional[str] = None
) -> Dict[str, Any]:
    """Provenance for purely deterministic heuristics, regex, or rule-based logic."""
    ev = evidence or []
    return create_provenance(
        engine="deterministic",
        provider=None,
        model=None,
        grounded=bool(len(ev) > 0),
        confidence_score=None,
        confidence_methodology=methodology,
        retrieval_score=retrieval_score,
        retrieval_methodology=retrieval_methodology,
        evidence=ev,
        fallback=fallback
    )


def create_llm_provenance(
    provider: str = "gemini",
    model: Optional[str] = None,
    grounded: bool = False,
    evidence: Optional[List[Any]] = None,
    confidence_score: Optional[float] = None,
    methodology: str = "not_available"
) -> Dict[str, Any]:
    """Provenance for pure external LLM calls."""
    return create_provenance(
        engine="llm",
        provider=provider,
        model=model or get_active_gemini_model(),
        grounded=grounded,
        confidence_score=confidence_score,
        confidence_methodology=methodology,
        evidence=evidence or [],
        fallback=False
    )


def create_hybrid_provenance(
    provider: str = "gemini",
    model: Optional[str] = None,
    grounded: bool = True,
    evidence: Optional[List[Any]] = None,
    confidence_score: Optional[float] = None,
    methodology: str = "not_available",
    retrieval_score: Optional[float] = None,
    retrieval_methodology: str = "cosine_similarity",
    fallback: bool = False
) -> Dict[str, Any]:
    """Provenance for hybrid workflows combining deterministic retrieval/diff with LLM generation."""
    return create_provenance(
        engine="hybrid",
        provider=provider,
        model=model or get_active_gemini_model(),
        grounded=grounded,
        confidence_score=confidence_score,
        confidence_methodology=methodology,
        retrieval_score=retrieval_score,
        retrieval_methodology=retrieval_methodology,
        evidence=evidence or [],
        fallback=fallback
    )
