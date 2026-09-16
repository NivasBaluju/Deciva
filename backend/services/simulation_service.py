import os
import re
import json
import urllib.request
from typing import Dict, Any, List, Optional, Tuple

try:
    from backend.services.retrieval_service import retrieve_relevant_segments
    from backend.services.database import get_db_connection
    from backend.services.ai_provenance import (
        get_active_gemini_model,
        get_gemini_api_key,
        create_hybrid_provenance,
        create_deterministic_provenance
    )
    from backend.services.analysis.risk_scoring import calculate_document_risk
    from backend.services.analysis.missing_clause import detect_missing_clauses
except ImportError:
    from services.retrieval_service import retrieve_relevant_segments
    from services.database import get_db_connection
    from services.ai_provenance import (
        get_active_gemini_model,
        get_gemini_api_key,
        create_hybrid_provenance,
        create_deterministic_provenance
    )
    from services.analysis.risk_scoring import calculate_document_risk
    from services.analysis.missing_clause import detect_missing_clauses

DISCLAIMER_TEXT = "This is a hypothetical scenario analysis based on provisions identified in the document. It does not constitute formal legal advice."

# Stop words to filter out when checking topical overlap
BASIC_STOP_WORDS = {
    "what", "happens", "if", "the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "of", "with",
    "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
    "could", "should", "would", "may", "might", "must", "can", "this", "that", "these", "those",
    "party", "contract", "agreement", "case", "situation", "scenario"
}

def extract_scenario_keywords(scenario: str) -> List[str]:
    """Extracts non-trivial keywords from the user scenario."""
    tokens = re.findall(r'\b[a-zA-Z]{3,}\b', (scenario or "").lower())
    return [t for t in tokens if t not in BASIC_STOP_WORDS]

def construct_modified_contract_state(
    original_text: str,
    target_clause: str,
    proposed_clause: str,
    context_text: Optional[str] = None
) -> Tuple[str, bool, str]:
    """
    Constructs an ephemeral, in-memory modified contract text by replacing
    target_clause with proposed_clause.
    
    Returns (modified_text, success, error_message).
    Guarantees:
      1. Exact match attempted first.
      2. Whitespace-normalized match attempted second.
      3. Long-phrase anchor matching attempted third for truncated snippets.
      4. Only ONE instance is substituted; surrounding contract text is immutable.
      5. Rejects ambiguous substitution if multiple identical matches exist without context.
      6. Does NOT silently substitute if target clause is absent.
      7. Never writes to disk or database.
    """
    if not original_text:
        return original_text, False, "Original document text is empty."

    target_clean = (target_clause or "").strip()
    if not target_clean:
        return original_text, False, "Target clause text is required for substitution."

    proposed_clean = (proposed_clause or "").strip()

    # 1. Exact match
    if target_clean in original_text:
        occurrences = original_text.count(target_clean)
        if occurrences > 1:
            if context_text and context_text.strip() in original_text:
                ctx = context_text.strip()
                if target_clean in ctx:
                    ctx_start = original_text.find(ctx)
                    offset_in_ctx = ctx.find(target_clean)
                    match_start = ctx_start + offset_in_ctx
                    match_end = match_start + len(target_clean)
                    modified = original_text[:match_start] + proposed_clean + original_text[match_end:]
                    return modified, True, ""
            return original_text, False, f"Ambiguous target clause: {occurrences} identical occurrences detected in document text without distinguishing positional context."

        modified = original_text.replace(target_clean, proposed_clean, 1)
        return modified, True, ""

    # 2. Whitespace-normalized match
    target_words = re.findall(r'\S+', target_clean)
    if not target_words:
        return original_text, False, "Target clause contains no words."

    escaped_words = [re.escape(w) for w in target_words]
    pattern = r'\s+'.join(escaped_words)

    matches = list(re.finditer(pattern, original_text, re.IGNORECASE))
    if len(matches) > 1:
        if context_text and context_text.strip() in original_text:
            ctx = context_text.strip()
            ctx_start = original_text.find(ctx)
            ctx_end = ctx_start + len(ctx)
            scoped_matches = [m for m in matches if ctx_start <= m.start() < ctx_end]
            if len(scoped_matches) == 1:
                m = scoped_matches[0]
                modified = original_text[:m.start()] + proposed_clean + original_text[m.end():]
                return modified, True, ""
        return original_text, False, f"Ambiguous target clause: {len(matches)} pattern matches detected in document text without distinguishing positional context."
    elif len(matches) == 1:
        start, end = matches[0].span()
        modified = original_text[:start] + proposed_clean + original_text[end:]
        return modified, True, ""

    # 3. Substring window match (if target snippet was truncated with ellipsis)
    clean_no_dots = re.sub(r'[\.]{2,}', '', target_clean).strip()
    words_no_dots = re.findall(r'\S+', clean_no_dots)
    if len(words_no_dots) >= 4:
        anchor_len = min(6, len(words_no_dots))
        anchor_pattern = r'\s+'.join([re.escape(w) for w in words_no_dots[:anchor_len]])
        anchor_matches = list(re.finditer(anchor_pattern, original_text, re.IGNORECASE))
        if len(anchor_matches) == 1:
            anchor_match = anchor_matches[0]
            end_anchor_len = min(5, len(words_no_dots))
            end_pattern = r'\s+'.join([re.escape(w) for w in words_no_dots[-end_anchor_len:]])
            end_matches = list(re.finditer(end_pattern, original_text[anchor_match.start():], re.IGNORECASE))
            if len(end_matches) >= 1:
                end_match = end_matches[0]
                full_end = anchor_match.start() + end_match.end()
                modified = original_text[:anchor_match.start()] + proposed_clean + original_text[full_end:]
                return modified, True, ""

    return original_text, False, "Target clause could not be located in document text."

def compare_risk_findings(
    before_factors: List[Dict[str, Any]],
    after_factors: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Computes deterministic finding diffs between baseline and simulated states.
    """
    before_hazards = {f.get("riskType"): f for f in (before_factors or []) if f.get("category") == "CONFIRMED_HAZARD"}
    after_hazards = {f.get("riskType"): f for f in (after_factors or []) if f.get("category") == "CONFIRMED_HAZARD"}

    resolved_hazards = [rtype for rtype in before_hazards if rtype not in after_hazards]
    introduced_hazards = [rtype for rtype in after_hazards if rtype not in before_hazards]

    before_hazard_pts = sum(f.get("riskPoints", 0) for f in before_hazards.values())
    after_hazard_pts = sum(f.get("riskPoints", 0) for f in after_hazards.values())

    before_omissions = {f.get("riskType"): f for f in (before_factors or []) if f.get("category") == "POTENTIAL_OMISSION"}
    after_omissions = {f.get("riskType"): f for f in (after_factors or []) if f.get("category") == "POTENTIAL_OMISSION"}

    resolved_omissions = [rtype for rtype in before_omissions if rtype not in after_omissions]
    introduced_omissions = [rtype for rtype in after_omissions if rtype not in before_omissions]

    before_omission_pts = sum(f.get("riskPoints", 0) for f in before_omissions.values())
    after_omission_pts = sum(f.get("riskPoints", 0) for f in after_omissions.values())

    return {
        "beforeFactors": before_factors,
        "afterFactors": after_factors,
        "resolvedHazards": resolved_hazards,
        "introducedHazards": introduced_hazards,
        "hazardPointsDelta": after_hazard_pts - before_hazard_pts,
        "resolvedOmissions": resolved_omissions,
        "introducedOmissions": introduced_omissions,
        "omissionPointsDelta": after_omission_pts - before_omission_pts
    }

def synthesize_hypothetical_impact(
    scenario: str,
    evidence_text: str,
    risk_context: List[str],
    risk_delta: int = 0,
    risk_direction: str = "UNCHANGED",
    resolved_hazards: Optional[List[str]] = None,
    introduced_hazards: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Deterministic, context-bounded scenario impact synthesizer used when LLM API is unavailable.
    Produces structured scenario consequences grounded in the contract terms and deterministic deltas.
    """
    sc_lower = (scenario or "").lower()
    ev_lower = (evidence_text or "").lower()

    delta_note = ""
    if risk_delta < 0:
        delta_note = f" (Quantitative risk reduced by {abs(risk_delta)} points)."
    elif risk_delta > 0:
        delta_note = f" (Quantitative risk increased by {risk_delta} points)."

    if "pay" in sc_lower or "invoice" in sc_lower or "late" in sc_lower or "fee" in sc_lower:
        days_match = re.search(r'(\d+)\s*days?', sc_lower)
        contract_days_match = re.search(r'(\d+)\s*(?:\([^\)]+\))?\s*days?', ev_lower)
        contract_timeline = contract_days_match.group(0) if contract_days_match else "the contractual due date"

        return {
            "potentialImpact": f"If payment is delayed beyond {contract_timeline}, the paying party enters default status under the identified payment terms, which may trigger late interest or contractual remedies.{delta_note}",
            "riskLevel": "HIGH" if (days_match and int(days_match.group(1)) > 30) else "MEDIUM",
            "affectedAreas": ["Payment Terms", "Commercial Remedies", "Default Provisions"],
            "possibleConsequences": [
                f"The paying party is in technical breach once payment exceeds {contract_timeline}.",
                "The performing party may withhold further deliverables or suspend performance subject to notice requirements.",
                "Accrual of statutory or contractually specified late interest fees."
            ],
            "recommendedNextSteps": [
                "Issue a formal written notice of overdue invoice referencing the specific payment clause.",
                "Review whether a cure period or dispute notification procedure exists before initiating collection.",
                "Propose a structured payment cure schedule to preserve the commercial relationship."
            ],
            "disclaimer": DISCLAIMER_TEXT
        }

    elif "terminat" in sc_lower or "cancel" in sc_lower or "exit" in sc_lower:
        has_notice = "without notice" in sc_lower or "immediately" in sc_lower
        return {
            "potentialImpact": f"An immediate or unnotified termination creates significant exposure to breach of contract claims unless expressly authorized under the termination or default provisions.{delta_note}",
            "riskLevel": "HIGH",
            "affectedAreas": ["Termination Provisions", "Notice Requirements", "Liability for Wrongful Termination"],
            "possibleConsequences": [
                "Attempting immediate termination without required contractual notice constitutes wrongful repudiation.",
                "The counterparty may seek damages for lost profits or unamortized service costs.",
                "Termination triggers post-termination survival clauses including confidentiality and return of materials."
            ],
            "recommendedNextSteps": [
                "Audit the contract for mandatory written notice periods and cure windows before issuing termination notices.",
                "Document all material defaults with timestamped evidentiary records.",
                "Consult legal counsel to deliver formal notice adhering strictly to the contract's notice delivery clause."
            ],
            "disclaimer": DISCLAIMER_TEXT
        }

    elif "confidential" in sc_lower or "disclos" in sc_lower or "leak" in sc_lower or "trade secret" in sc_lower:
        return {
            "potentialImpact": f"Unauthorized disclosure of confidential materials violates core non-disclosure obligations, potentially entitling the non-breaching party to immediate injunctive relief and uncapped damages.{delta_note}",
            "riskLevel": "HIGH",
            "affectedAreas": ["Confidentiality", "Injunctive Relief", "Indemnification Obligations"],
            "possibleConsequences": [
                "The non-breaching party is likely entitled to seek emergency restraining orders or preliminary injunctions.",
                "Liability caps frequently exclude breaches of confidentiality, creating unbounded financial exposure.",
                "Possible mandatory indemnity for third-party claims arising from the disclosure."
            ],
            "recommendedNextSteps": [
                "Immediately enact containment procedures to prevent further dissemination of disclosed materials.",
                "Provide prompt written notice to the disclosing party describing the incident and mitigation actions.",
                "Conduct an internal forensic audit to document how the disclosure occurred."
            ],
            "disclaimer": DISCLAIMER_TEXT
        }

    elif "liab" in sc_lower or "damage" in sc_lower or "indemn" in sc_lower or "sue" in sc_lower or "cap" in sc_lower:
        return {
            "potentialImpact": f"Damages arising under this scenario will be governed by the contract's liability limitations and mutual exclusion of consequential damages.{delta_note}",
            "riskLevel": "HIGH" if "unlimited" in ev_lower else "MEDIUM",
            "affectedAreas": ["Limitation of Liability", "Consequential Damages Carve-outs", "Indemnification"],
            "possibleConsequences": [
                "Recovery may be strictly capped at fees paid over the preceding 6 to 12 months if a cap is in place.",
                "Claims for indirect or lost profits will be excluded if standard mutual waivers apply.",
                "Indemnification claims may require the indemnifying party to assume defense costs."
            ],
            "recommendedNextSteps": [
                "Determine whether the claim falls within any express exceptions to the liability cap.",
                "Verify whether timely tender of defense is required under indemnification provisions.",
                "Notify commercial liability insurance carriers promptly upon assertion of claims."
            ],
            "disclaimer": DISCLAIMER_TEXT
        }

    # General scenario fallback
    return {
        "potentialImpact": f"The hypothetical scenario triggers the rights and obligations specified in the governing contract provisions.{delta_note}",
        "riskLevel": "MEDIUM",
        "affectedAreas": ["Contractual Obligations", "Operational Compliance"],
        "possibleConsequences": [
            "The scenario requires strict compliance with contractual timelines and performance metrics.",
            "Failure to follow procedural requirements may waive contractual defense rights."
        ],
        "recommendedNextSteps": [
            "Review the full section in the executed contract.",
            "Seek written clarification from the counterparty regarding operational expectations."
        ],
        "disclaimer": DISCLAIMER_TEXT
    }

def simulate_contract_scenario(
    document_id: str,
    scenario: Optional[str] = None,
    clause_id: Optional[str] = None,
    original_clause: Optional[str] = None,
    proposed_clause: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    user_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Executes Contract Risk Simulation & What-If Analysis:
      1. Validates document existence and retrieves original text.
      2. If proposed_clause is provided:
         - Identifies original clause from clause_id or original_clause.
         - Constructs in-memory modified contract state without modifying DB.
         - Executes deterministic calculate_document_risk() on both baseline and modified state.
         - Computes objective risk_delta (after - before) and findings diff.
      3. If only scenario text is provided:
         - Executes isolated retrieval with Grounding Guard.
         - Refuses ungrounded hypothetical hallucinations.
         - Evaluates baseline deterministic risk score.
      4. Synthesizes explanation narrative via Gemini (or deterministic synthesizer).
         - LLM failure never destroys numeric simulation results.
      5. Returns standardized response with truthful AI provenance.
    """
    scenario_clean = (scenario or "").strip()
    proposed_clean = (proposed_clause or "").strip()
    original_clean = (original_clause or "").strip()

    if not scenario_clean and not proposed_clean:
        return {
            "error": "Either scenario text or proposedClause is required for risk simulation.",
            "status": 400
        }

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id, original_name, extracted_text, risk_score FROM documents WHERE id = %s;", (document_id,))
        doc = cur.fetchone()
        if not doc:
            return {"error": "Document not found", "status": 404}

        original_text = doc.get("extracted_text") or ""
        doc_title = doc.get("original_name") or "Contract"

        # Fetch existing detected clauses and missing clauses for baseline
        cur.execute("""
            SELECT id, clause_type, confidence, extracted_snippet, segment_id
            FROM document_clauses
            WHERE document_id = %s;
        """, (document_id,))
        clause_rows = cur.fetchall()

        detected_clauses = [
            {"clauseType": r["clause_type"], "confidence": float(r["confidence"] or 0.85), "snippet": r.get("extracted_snippet", "")}
            for r in clause_rows
        ]
        missing_clauses_info = detect_missing_clauses(detected_clauses)

        # Gather associated risk factors from PostgreSQL for prompt context
        cur.execute("""
            SELECT risk_type, reason, severity
            FROM document_risk_factors
            WHERE document_id = %s;
        """, (document_id,))
        risk_rows = cur.fetchall()
        risk_context = [f"{r['risk_type']} ({r['severity']}): {r['reason']}" for r in risk_rows]

        # Case 1: Structured clause modification simulation
        if proposed_clean:
            target_snippet = original_clean
            resolved_clause_id = clause_id

            if clause_id:
                cur.execute("""
                    SELECT id, clause_type, extracted_snippet, segment_id
                    FROM document_clauses
                    WHERE id = %s AND document_id = %s;
                """, (clause_id, document_id))
                c_row = cur.fetchone()
                if not c_row:
                    return {"error": "Clause not found in specified document", "status": 404}
                if not target_snippet:
                    target_snippet = c_row.get("extracted_snippet") or ""
                    if not target_snippet and c_row.get("segment_id"):
                        cur.execute("SELECT segment_text FROM document_segments WHERE id = %s;", (c_row["segment_id"],))
                        s_row = cur.fetchone()
                        if s_row:
                            target_snippet = s_row.get("segment_text") or ""

            if not target_snippet and scenario_clean:
                # Attempt to retrieve matching clause from document
                sources, meta = retrieve_relevant_segments(
                    document_id=document_id,
                    query=scenario_clean,
                    top_k=1,
                    min_similarity=0.15
                )
                if sources:
                    target_snippet = sources[0].get("excerpt", "")

            if not target_snippet:
                return {
                    "error": "Original clause text could not be identified for substitution. Provide clauseId or originalClause.",
                    "status": 400
                }

            # Construct modified contract text in memory
            modified_text, replace_ok, replace_err = construct_modified_contract_state(
                original_text=original_text,
                target_clause=target_snippet,
                proposed_clause=proposed_clean
            )
            if not replace_ok:
                return {
                    "error": f"Target clause could not be located in document text: {replace_err}",
                    "status": 400
                }

            # Deterministic calculation on original contract
            before_risk = calculate_document_risk(
                full_text=original_text,
                detected_clauses=detected_clauses,
                missing_clauses_info=missing_clauses_info
            )
            before_score = before_risk["score"]
            before_level = before_risk["level"]

            # Deterministic calculation on modified contract
            # Re-evaluate missing clauses on modified text if applicable
            after_risk = calculate_document_risk(
                full_text=modified_text,
                detected_clauses=detected_clauses,
                missing_clauses_info=missing_clauses_info
            )
            after_score = after_risk["score"]
            after_level = after_risk["level"]

            risk_delta = after_score - before_score
            if risk_delta < 0:
                risk_direction = "REDUCED"
            elif risk_delta > 0:
                risk_direction = "INCREASED"
            else:
                risk_direction = "UNCHANGED"

            findings_diff = compare_risk_findings(before_risk.get("factors", []), after_risk.get("factors", []))

            document_evidence = [
                {
                    "section": "Target Provision",
                    "segmentIndex": 0,
                    "excerpt": target_snippet[:300] + ("..." if len(target_snippet) > 300 else "")
                }
            ]

            # LLM Narrative explanation of deterministic calculation
            sim_analysis = None
            llm_used = False
            active_model = get_active_gemini_model()
            gemini_key = get_gemini_api_key()

            if gemini_key:
                try:
                    narrative_prompt = f"""You are Deciva, an institutional contract risk simulation engine.
A deterministic contract risk recalculation has been performed on the following clause modification.
Explain the deterministic findings and provide risk advisory recommendations.

ORIGINAL CONTRACT PROVISION:
"{target_snippet}"

PROPOSED MODIFIED PROVISION:
"{proposed_clean}"

DETERMINISTIC RECALCULATION RESULTS:
- Baseline Risk Score: {before_score}/100 ({before_level})
- Modified Risk Score: {after_score}/100 ({after_level})
- Risk Score Delta: {risk_delta:+d} points ({risk_direction})
- Resolved Hazards: {", ".join(findings_diff["resolvedHazards"]) if findings_diff["resolvedHazards"] else "None"}
- Introduced Hazards: {", ".join(findings_diff["introducedHazards"]) if findings_diff["introducedHazards"] else "None"}

Strict Rules:
1. Do NOT recalculate or change the numeric risk scores or delta. They are mathematically determined.
2. Focus on explaining WHY the risk changed and the legal/commercial implications.
3. Respond STRICTLY in JSON format matching this schema:
{{
  "potentialImpact": "Concise summary of the legal and commercial impact of this change",
  "affectedAreas": ["Area 1", "Area 2"],
  "possibleConsequences": ["Consequence 1", "Consequence 2"],
  "recommendedNextSteps": ["Step 1", "Step 2"]
}}
"""
                    url = f"https://generativelanguage.googleapis.com/v1beta/models/{active_model}:generateContent?key={gemini_key}"
                    req = urllib.request.Request(
                        url,
                        data=json.dumps({"contents": [{"parts": [{"text": narrative_prompt}]}], "generationConfig": {"temperature": 0.2}}).encode("utf-8"),
                        headers={"Content-Type": "application/json"},
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=12) as response:
                        res_data = json.loads(response.read().decode("utf-8"))
                        cand_text = res_data.get("candidates", [])[0].get("content", {}).get("parts", [])[0].get("text", "")
                        clean_json = re.search(r'\{.*\}', cand_text, re.DOTALL)
                        if clean_json:
                            parsed = json.loads(clean_json.group(0))
                            sim_analysis = {
                                "potentialImpact": parsed.get("potentialImpact", "Scenario analysis generated."),
                                "riskLevel": after_level,
                                "affectedAreas": parsed.get("affectedAreas", ["Contract Terms"]),
                                "possibleConsequences": parsed.get("possibleConsequences", []),
                                "recommendedNextSteps": parsed.get("recommendedNextSteps", []),
                                "disclaimer": DISCLAIMER_TEXT
                            }
                            llm_used = True
                except Exception:
                    sim_analysis = None
                    llm_used = False

            if not sim_analysis:
                sim_analysis = synthesize_hypothetical_impact(
                    scenario=scenario_clean or f"Modification to clause: {target_snippet[:60]}",
                    evidence_text=target_snippet,
                    risk_context=risk_context,
                    risk_delta=risk_delta,
                    risk_direction=risk_direction,
                    resolved_hazards=findings_diff.get("resolvedHazards"),
                    introduced_hazards=findings_diff.get("introducedHazards")
                )
                sim_analysis["riskLevel"] = after_level
                llm_used = False

            if llm_used:
                prov = create_hybrid_provenance(
                    provider="gemini",
                    model=active_model,
                    grounded=True,
                    evidence=document_evidence,
                    confidence_score=None,
                    methodology="not_available",
                    retrieval_score=None,
                    retrieval_methodology=None,
                    fallback=False
                )
            else:
                prov = create_deterministic_provenance(
                    methodology="deterministic_rule_based",
                    evidence=document_evidence,
                    fallback=True,
                    retrieval_score=None,
                    retrieval_methodology=None
                )

            return {
                "documentId": document_id,
                "scenario": scenario_clean or f"Clause Modification: {target_snippet[:50]}...",
                "clauseId": resolved_clause_id,
                "originalClause": target_snippet,
                "proposedClause": proposed_clean,
                "grounded": True,
                "beforeScore": before_score,
                "afterScore": after_score,
                "riskDelta": risk_delta,
                "riskDirection": risk_direction,
                "beforeLevel": before_level,
                "afterLevel": after_level,
                "riskFindings": findings_diff,
                "documentEvidence": document_evidence,
                "simulationAnalysis": sim_analysis,
                "engine": prov["engine"],
                "provider": prov["provider"],
                "model": prov["model"],
                "confidence": {
                    "score": None,
                    "methodology": prov["confidence"]["methodology"]
                },
                "confidenceScore": None,
                "retrieval_score": None,
                "retrieval_methodology": None,
                "sources": document_evidence,
                "provenance": prov
            }

        # Case 2: Query-based scenario (backward compatibility with Phase 6.3)
        sources, meta = retrieve_relevant_segments(
            document_id=document_id,
            query=scenario_clean,
            top_k=3,
            min_similarity=0.15
        )

        scenario_keywords = extract_scenario_keywords(scenario_clean)
        has_topical_overlap = False

        if sources and meta.get("grounded"):
            combined_evidence_text = " ".join([s.get("excerpt", "") for s in sources]).lower()
            if scenario_keywords:
                overlap_count = sum(1 for kw in scenario_keywords if kw in combined_evidence_text)
                if overlap_count > 0:
                    has_topical_overlap = True
            else:
                has_topical_overlap = True

        # Grounding Guard Triggered: Refuse without hallucination
        if not sources or not meta.get("grounded") or not has_topical_overlap:
            return {
                "documentId": document_id,
                "scenario": scenario_clean,
                "grounded": False,
                "beforeScore": doc.get("risk_score") or 5,
                "afterScore": doc.get("risk_score") or 5,
                "riskDelta": 0,
                "riskDirection": "UNCHANGED",
                "beforeLevel": "UNKNOWN",
                "afterLevel": "UNKNOWN",
                "documentEvidence": [],
                "simulationAnalysis": {
                    "potentialImpact": "I could not find sufficient contract provisions or evidence in this document to simulate this scenario.",
                    "riskLevel": "UNKNOWN",
                    "affectedAreas": [],
                    "possibleConsequences": [],
                    "recommendedNextSteps": [],
                    "disclaimer": DISCLAIMER_TEXT
                },
                "confidence": 0.0,
                "confidenceScore": None,
                "sources": []
            }

        document_evidence = []
        for s in sources:
            document_evidence.append({
                "section": s.get("section", "Contract Provision"),
                "segmentIndex": s.get("segmentIndex", 0),
                "excerpt": s.get("excerpt", "")
            })

        combined_excerpts = "\n\n".join([f"[{s.get('section')}]: {s.get('excerpt')}" for s in sources])

        # Evaluate deterministic baseline risk
        before_risk = calculate_document_risk(
            full_text=original_text,
            detected_clauses=detected_clauses,
            missing_clauses_info=missing_clauses_info
        )
        before_score = before_risk["score"]
        before_level = before_risk["level"]

        # For pure scenario queries without clause replacement, after score equals before score
        after_score = before_score
        after_level = before_level
        risk_delta = 0
        risk_direction = "UNCHANGED"
        findings_diff = compare_risk_findings(before_risk.get("factors", []), before_risk.get("factors", []))

        gemini_key = get_gemini_api_key()
        sim_analysis = None
        llm_used = False
        active_model = get_active_gemini_model()

        if gemini_key:
            try:
                prompt = f"""You are Deciva, an expert contract risk simulation engine.
Analyze the following hypothetical scenario strictly based on the provided contract evidence.

HYPOTHETICAL SCENARIO:
"{scenario_clean}"

RELEVANT CONTRACT PROVISIONS (DOCUMENT EVIDENCE):
{combined_excerpts}

ASSOCIATED DOCUMENT RISKS:
{"; ".join(risk_context) if risk_context else "None"}

Perform a scenario risk simulation. Respond STRICTLY in JSON format with this schema:
{{
  "potentialImpact": "Concise summary of the legal, operational, and financial impact if this scenario occurs",
  "riskLevel": "HIGH" | "MEDIUM" | "LOW",
  "affectedAreas": ["Area 1", "Area 2"],
  "possibleConsequences": ["Consequence 1", "Consequence 2"],
  "recommendedNextSteps": ["Step 1", "Step 2"]
}}
"""
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{active_model}:generateContent?key={gemini_key}"
                req = urllib.request.Request(
                    url,
                    data=json.dumps({"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0.2}}).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=12) as response:
                    res_data = json.loads(response.read().decode("utf-8"))
                    cand_text = res_data.get("candidates", [])[0].get("content", {}).get("parts", [])[0].get("text", "")
                    clean_json = re.search(r'\{.*\}', cand_text, re.DOTALL)
                    if clean_json:
                        parsed = json.loads(clean_json.group(0))
                        sim_analysis = {
                            "potentialImpact": parsed.get("potentialImpact", "Scenario analysis generated."),
                            "riskLevel": parsed.get("riskLevel", "MEDIUM"),
                            "affectedAreas": parsed.get("affectedAreas", ["Contract Terms"]),
                            "possibleConsequences": parsed.get("possibleConsequences", []),
                            "recommendedNextSteps": parsed.get("recommendedNextSteps", []),
                            "disclaimer": DISCLAIMER_TEXT
                        }
                        llm_used = True
            except Exception:
                sim_analysis = None
                llm_used = False

        if not sim_analysis:
            sim_analysis = synthesize_hypothetical_impact(scenario_clean, combined_excerpts, risk_context)
            llm_used = False

        raw_top = meta.get("topScore")
        retrieval_score = round(float(raw_top), 3) if raw_top is not None else None
        retrieval_methodology = "cosine_similarity" if retrieval_score is not None else None
        is_grounded = bool(document_evidence and len(document_evidence) > 0)

        if llm_used:
            prov = create_hybrid_provenance(
                provider="gemini",
                model=active_model,
                grounded=is_grounded,
                evidence=document_evidence,
                confidence_score=None,
                methodology="not_available",
                retrieval_score=retrieval_score,
                retrieval_methodology=retrieval_methodology,
                fallback=False
            )
        else:
            prov = create_deterministic_provenance(
                methodology="deterministic_rule_based",
                evidence=document_evidence,
                fallback=True,
                retrieval_score=retrieval_score,
                retrieval_methodology=retrieval_methodology
            )

        return {
            "documentId": document_id,
            "scenario": scenario_clean,
            "grounded": prov["grounded"],
            "beforeScore": before_score,
            "afterScore": after_score,
            "riskDelta": risk_delta,
            "riskDirection": risk_direction,
            "beforeLevel": before_level,
            "afterLevel": after_level,
            "riskFindings": findings_diff,
            "documentEvidence": document_evidence,
            "simulationAnalysis": sim_analysis,
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
            "sources": sources,
            "provenance": prov
        }

    finally:
        cur.close()
        conn.close()
