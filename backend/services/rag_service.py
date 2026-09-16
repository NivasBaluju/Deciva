import os
import json
import urllib.request
import urllib.error
from typing import Dict, Any, List

try:
    from backend.services.retrieval_service import retrieve_relevant_segments
    from backend.services.ai_provenance import (
        get_active_gemini_model,
        get_gemini_api_key,
        create_hybrid_provenance,
        create_deterministic_provenance
    )
except ImportError:
    from services.retrieval_service import retrieve_relevant_segments
    from services.ai_provenance import (
        get_active_gemini_model,
        get_gemini_api_key,
        create_hybrid_provenance,
        create_deterministic_provenance
    )

UNGROUNDED_RESPONSE = "I could not find sufficient information in this document to answer that question."

def format_grounded_prompt(question: str, sources: List[Dict[str, Any]]) -> str:
    """
    Constructs a strictly bounded RAG prompt with numbered source context blocks.
    """
    context_blocks = []
    for s in sources:
        section = s.get("section", f"Segment {s.get('segmentIndex', 0) + 1}")
        seg_idx = s.get("segmentIndex", 0)
        text = s.get("fullText", s.get("excerpt", ""))
        context_blocks.append(f"[Source {s.get('rank', 1)}]\nSection: {section}\nSegment Index: {seg_idx}\n{text}\n")

    context_str = "\n".join(context_blocks)

    return f"""You are Deciva, an institutional contract document assistant.
Answer ONLY using the provided document context.

Strict Rules:
1. Do not use external knowledge.
2. Do not invent facts, parties, dates, or legal liabilities.
3. Do not infer information not reasonably supported by the retrieved segments.
4. If the context is insufficient, respond strictly with: "{UNGROUNDED_RESPONSE}"
5. Do not claim something exists in the document unless it appears in the provided context.
6. Reference the relevant section or segment when answering.

DOCUMENT CONTEXT:
{context_str}

USER QUESTION:
{question}

GROUNDED ANSWER:"""

def call_gemini_api(prompt: str, api_key: str, model: str = None) -> str:
    """
    Calls Google Gemini REST API using standard urllib.
    """
    active_model = model or get_active_gemini_model()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{active_model}:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 600
        }
    }

    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=12) as response:
        res_data = json.loads(response.read().decode("utf-8"))
        candidates = res_data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                return parts[0].get("text", "").strip()
    return ""

def synthesize_extractive_answer(question: str, sources: List[Dict[str, Any]]) -> str:
    """
    Deterministic extractive legal synthesiser used when external LLM API is unavailable.
    Provides precise, grounded summaries directly from top-ranked segments.
    """
    if not sources:
        return UNGROUNDED_RESPONSE

    import re
    q_lower = (question or "").lower()
    stop_words = {'what', 'are', 'the', 'is', 'a', 'an', 'in', 'of', 'for', 'to', 'this', 'document', 'and', 'does', 'do', 'any', 'how', 'when', 'who', 'where', 'which'}
    q_words = set(re.findall(r'\w+', q_lower)) - stop_words

    # Collect sentences from all retrieved sources
    candidates = []
    for s in sources:
        sec = s.get("section", "the document")
        raw = s.get("fullText") or s.get("excerpt") or ""
        splits = re.split(r'[\r\n]+|(?<=[.!?])\s+', raw)
        for sp in splits:
            clean = sp.strip()
            if len(clean) >= 10:
                sent_words = set(re.findall(r'\w+', clean.lower()))
                overlap = len(q_words & sent_words)
                candidates.append((overlap, clean, sec))

    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        if candidates[0][0] > 0:
            top_sents = [c[1] for c in candidates if c[0] == candidates[0][0]][:2]
            sec = candidates[0][2]
            return f"According to {sec}: " + " ".join(top_sents)

    top_source = sources[0]
    section = top_source.get("section", "the document")
    full_text = top_source.get("fullText", top_source.get("excerpt", "")).strip()
    return f"According to {section}: {full_text[:300]}"

def answer_document_question(document_id: str, question: str) -> Dict[str, Any]:
    """
    Executes the complete Phase 6.1 Document RAG pipeline:
      1. Retrieval of existing PostgreSQL segments (isolated by document_id)
      2. Grounding Guard evaluation (similarity threshold check)
      3. Bounded LLM generation or deterministic grounded synthesis
      4. Returns structured answer + citations
    """
    q = (question or "").strip()
    if not q:
        prov = create_deterministic_provenance(
            methodology="insufficient_evidence",
            evidence=[]
        )
        return {
            "documentId": document_id,
            "answer": "Please provide a valid question.",
            "grounded": False,
            "answer_status": "insufficient_evidence",
            "engine": "deterministic",
            "provider": None,
            "model": None,
            "confidence": {
                "score": None,
                "methodology": "insufficient_evidence"
            },
            "confidenceScore": None,
            "retrieval_score": None,
            "retrieval_methodology": None,
            "sources": [],
            "provenance": prov
        }

    sources, meta = retrieve_relevant_segments(document_id, q)

    if not meta.get("grounded") or not sources:
        prov = create_deterministic_provenance(
            methodology="insufficient_evidence",
            evidence=[]
        )
        return {
            "documentId": document_id,
            "answer": UNGROUNDED_RESPONSE,
            "grounded": False,
            "answer_status": "insufficient_evidence",
            "engine": "deterministic",
            "provider": None,
            "model": None,
            "confidence": {
                "score": None,
                "methodology": "insufficient_evidence"
            },
            "confidenceScore": None,
            "retrieval_score": None,
            "retrieval_methodology": None,
            "sources": [],
            "provenance": prov
        }

    # Prepare sanitized source citations (remove fullText for network compactness)
    clean_sources = [
        {
            "segmentId": s["segmentId"],
            "segmentIndex": s["segmentIndex"],
            "section": s["section"],
            "excerpt": s["excerpt"],
            "similarity": s["similarity"],
            "rank": s["rank"]
        }
        for s in sources
    ]

    gemini_key = get_gemini_api_key()
    active_model = get_active_gemini_model()
    answer_text = ""
    llm_used = False

    if gemini_key:
        try:
            prompt = format_grounded_prompt(q, sources)
            answer_text = call_gemini_api(prompt, gemini_key, active_model)
            if answer_text:
                llm_used = True
        except Exception as e:
            # Fallback to deterministic synthesis if API quota or network error occurs
            answer_text = synthesize_extractive_answer(q, sources)
            llm_used = False
    else:
        answer_text = synthesize_extractive_answer(q, sources)
        llm_used = False

    if not answer_text or answer_text.strip() == UNGROUNDED_RESPONSE:
        prov = create_deterministic_provenance(
            methodology="insufficient_evidence",
            evidence=[]
        )
        return {
            "documentId": document_id,
            "answer": UNGROUNDED_RESPONSE,
            "grounded": False,
            "answer_status": "insufficient_evidence",
            "engine": "deterministic",
            "provider": None,
            "model": None,
            "confidence": {
                "score": None,
                "methodology": "insufficient_evidence"
            },
            "confidenceScore": None,
            "retrieval_score": None,
            "retrieval_methodology": None,
            "sources": [],
            "provenance": prov
        }

    raw_top = meta.get("topScore")
    retrieval_score = round(float(raw_top), 3) if raw_top is not None else None
    retrieval_methodology = "cosine_similarity" if retrieval_score is not None else None

    if llm_used:
        prov = create_hybrid_provenance(
            provider="gemini",
            model=active_model,
            grounded=True,
            evidence=clean_sources,
            confidence_score=None,
            methodology="not_available",
            retrieval_score=retrieval_score,
            retrieval_methodology=retrieval_methodology,
            fallback=False
        )
    else:
        prov = create_deterministic_provenance(
            methodology="deterministic_extractive",
            evidence=clean_sources,
            fallback=True,
            retrieval_score=retrieval_score,
            retrieval_methodology=retrieval_methodology
        )

    return {
        "documentId": document_id,
        "answer": answer_text,
        "grounded": True,
        "engine": prov["engine"],
        "provider": prov["provider"],
        "model": prov["model"],
        "confidence": {
            "score": None,
            "methodology": prov["confidence"]["methodology"]
        },
        "confidenceScore": None,
        "retrieval_score": retrieval_score,
        "retrieval_methodology": retrieval_methodology,
        "sources": clean_sources,
        "provenance": prov
    }
