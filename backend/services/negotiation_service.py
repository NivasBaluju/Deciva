import os
import re
import json
import urllib.request
from typing import Dict, Any, List, Optional

try:
    from backend.services.database import get_db_connection
    from backend.services.diff_service import compute_word_diff
    from backend.services.ai_provenance import (
        get_active_gemini_model,
        get_gemini_api_key,
        create_hybrid_provenance,
        create_deterministic_provenance
    )
    from backend.services.analysis.risk_scoring import calculate_document_risk
    from backend.services.analysis.missing_clause import detect_missing_clauses
    from backend.services.simulation_service import construct_modified_contract_state, compare_risk_findings
except ImportError:
    from services.database import get_db_connection
    from services.diff_service import compute_word_diff
    from services.ai_provenance import (
        get_active_gemini_model,
        get_gemini_api_key,
        create_hybrid_provenance,
        create_deterministic_provenance
    )
    from services.analysis.risk_scoring import calculate_document_risk
    from services.analysis.missing_clause import detect_missing_clauses
    from services.simulation_service import construct_modified_contract_state, compare_risk_findings

VALID_NEGOTIATION_MODES = ["balanced", "protective", "aggressive", "collaborative"]

MODE_OBJECTIVES = {
    "balanced": [
        "make_rights_and_obligations_mutual",
        "establish_reasonable_cure_and_notice_periods",
        "fair_commercial_risk_allocation"
    ],
    "protective": [
        "reduce_direct_and_indirect_financial_exposure",
        "restrict_unilateral_counterparty_remedies",
        "insert_liability_caps_and_broad_exceptions"
    ],
    "aggressive": [
        "shorten_counterparty_cure_windows",
        "expand_audit_and_termination_remedies",
        "maximize_immediate_recovery_and_injunctive_rights"
    ],
    "collaborative": [
        "introduce_executive_escalation_before_litigation",
        "incorporate_commercial_reasonableness_standards",
        "establish_mutual_consultation_milestones"
    ]
}

def format_negotiation_prompt(clause_text: str, clause_type: str, mode: str, risk_context: List[str]) -> str:
    objectives = MODE_OBJECTIVES.get(mode, MODE_OBJECTIVES["balanced"])
    obj_str = "\n".join([f"- {o.replace('_', ' ').title()}" for o in objectives])
    risk_str = "; ".join(risk_context) if risk_context else "Standard contract risk review"

    return f"""You are Deciva, an expert contract negotiation co-pilot.
Analyze the following original contract clause and propose a negotiated redline revision based on the selected negotiation posture.

ORIGINAL CLAUSE (DOCUMENT FACT):
"{clause_text}"

CLAUSE TYPE: {clause_type}
NEGOTIATION MODE: {mode.upper()}
STRATEGIC OBJECTIVES:
{obj_str}

ASSOCIATED CONTRACT RISKS:
{risk_str}

Respond STRICTLY in JSON format matching this schema:
{{
  "riskSeverity": "HIGH" | "MEDIUM" | "LOW",
  "identifiedImbalance": "Concise 1-sentence description of the legal or commercial imbalance in the original clause",
  "strategy": "Actionable negotiation advice explaining what position to take and why",
  "suggestedRevision": "The precise rewritten clause wording incorporating the strategic objectives"
}}
"""

def synthesize_contextual_recommendation(clause_text: str, clause_type: str, mode: str, risk_context: List[str]) -> Dict[str, Any]:
    """
    Deterministic, context-aware legal redline synthesizer used when LLM API is unavailable.
    Applies contextual transformation rules tailored to the negotiation posture.
    """
    text = (clause_text or "").strip()
    c_type = (clause_type or "").upper()
    objectives = MODE_OBJECTIVES.get(mode, MODE_OBJECTIVES["balanced"])

    if "TERMINATION" in c_type or "terminate" in text.lower():
        if mode == "protective":
            revised = re.sub(r'(?i)\b(at any time without notice|immediately without cause)\b', "upon forty-five (45) days' prior written notice, subject to a thirty (30) day right to cure any alleged material breach", text)
            if revised == text:
                revised = "Either party may terminate this Agreement only upon thirty (30) days' prior written notice in the event of a material breach that remains uncured after written notification."
            return {
                "riskSeverity": "HIGH",
                "identifiedImbalance": "Unrestricted or unilateral termination privileges create critical business disruption risks.",
                "strategy": "Require substantial advance notice (45 days) and an mandatory opportunity to cure material breaches before termination.",
                "suggestedRevision": revised,
                "objectives": objectives
            }
        elif mode == "aggressive":
            revised = "The Company may terminate this Agreement immediately upon written notice for any default, while the counterparty must provide sixty (60) days' prior written notice and satisfy all outstanding deliverables."
            return {
                "riskSeverity": "HIGH",
                "identifiedImbalance": "Termination terms should provide maximal leverage and immediate exit remedies upon counterparty non-performance.",
                "strategy": "Secure unilateral immediate termination rights for your organization while binding the counterparty to extended notice windows.",
                "suggestedRevision": revised,
                "objectives": objectives
            }
        elif mode == "collaborative":
            revised = "In the event of a dispute or desire to terminate, the parties agree to first engage in good-faith executive escalation for fifteen (15) business days prior to issuing any formal thirty (30) day notice of termination."
            return {
                "riskSeverity": "MEDIUM",
                "identifiedImbalance": "Immediate termination without dialogue can prematurely dissolve valuable commercial partnerships.",
                "strategy": "Introduce an informal executive consultation period before formal termination procedures can be initiated.",
                "suggestedRevision": revised,
                "objectives": objectives
            }
        else: # balanced
            revised = re.sub(r'(?i)\b(the client|the company|either party|supplier)\s+may terminate\b.*', "Either party may terminate this Agreement by providing thirty (30) days' prior written notice to the other party.", text)
            if not revised or revised == text:
                revised = "Either party may terminate this Agreement by providing thirty (30) days' prior written notice to the other party."
            return {
                "riskSeverity": "HIGH" if "without notice" in text.lower() else "MEDIUM",
                "identifiedImbalance": "Termination rights should be bilateral with standard commercial notice rather than unilateral.",
                "strategy": "Make termination rights strictly mutual and tie them to a standard 30-day written notice requirement.",
                "suggestedRevision": revised,
                "objectives": objectives
            }

    elif "LIABILITY" in c_type or "liab" in text.lower() or "damage" in text.lower():
        if mode == "protective":
            revised = "In no event shall either party's aggregate liability under this Agreement exceed the total fees paid or payable during the preceding six (6) month period, and neither party shall be liable for indirect, punitive, or consequential damages."
            return {
                "riskSeverity": "HIGH",
                "identifiedImbalance": "Uncapped liability exposes the organization to unbounded financial and legal exposure.",
                "strategy": "Institute an aggregate liability ceiling tied to 6 months of contract fees and exclude all consequential damages.",
                "suggestedRevision": revised,
                "objectives": objectives
            }
        elif mode == "aggressive":
            revised = "The counterparty's liability for breach of confidentiality, intellectual property, or indemnification shall be uncapped, while Company's aggregate liability shall be capped at $5,000."
            return {
                "riskSeverity": "HIGH",
                "identifiedImbalance": "Liability carve-outs should maximize counterparty accountability for critical operational breaches.",
                "strategy": "Carve out key counterparty breach areas from liability caps while securing a nominal cap for your side.",
                "suggestedRevision": revised,
                "objectives": objectives
            }
        elif mode == "collaborative":
            revised = "Each party's aggregate liability arising under this Agreement shall be reasonably capped at the total contract value, with mutual exclusions for lost profits and standard commercially equitable carve-outs."
            return {
                "riskSeverity": "MEDIUM",
                "identifiedImbalance": "Asymmetrical liability caps impede mutual trust and risk sharing.",
                "strategy": "Align both parties around a mutual 12-month contract value liability cap.",
                "suggestedRevision": revised,
                "objectives": objectives
            }
        else: # balanced
            revised = "Except for gross negligence or willful misconduct, neither party's aggregate liability shall exceed the total fees paid under this Agreement during the preceding twelve (12) months."
            return {
                "riskSeverity": "HIGH" if "unlimited" in text.lower() else "MEDIUM",
                "identifiedImbalance": "Liability is insufficiently capped or lacks standard mutual exclusions.",
                "strategy": "Establish a mutual 12-month fee cap with standard carve-outs for gross negligence.",
                "suggestedRevision": revised,
                "objectives": objectives
            }

    elif "PAYMENT" in c_type or "pay" in text.lower() or "invoice" in text.lower():
        if mode == "protective":
            revised = "Payment of undisputed invoices shall be due within forty-five (45) days of receipt. Client shall have thirty (30) days to review and dispute any charges in good faith without penalty."
            return {
                "riskSeverity": "MEDIUM",
                "identifiedImbalance": "Accelerated payment terms without dispute mechanisms create cash-flow and billing audit risks.",
                "strategy": "Extend payment terms to Net 45 and establish an express right to withhold disputed amounts without penalty.",
                "suggestedRevision": revised,
                "objectives": objectives
            }
        elif mode == "aggressive":
            revised = "Payment shall be due strictly within fifteen (15) days of invoice date. Overdue amounts shall accrue late interest at 1.5% per month plus all collection costs."
            return {
                "riskSeverity": "MEDIUM",
                "identifiedImbalance": "Extended payment cycles strain liquidity and increase collection risk.",
                "strategy": "Demand Net 15 terms with aggressive late interest penalties for delayed settlement.",
                "suggestedRevision": revised,
                "objectives": objectives
            }
        elif mode == "collaborative":
            revised = "Invoices shall be payable within thirty (30) days of receipt. In the event of a billing question, the parties will promptly confer to resolve discrepancies collaboratively."
            return {
                "riskSeverity": "LOW",
                "identifiedImbalance": "Rigid invoice payment clauses lack collaborative dispute resolution mechanisms.",
                "strategy": "Adopt standard Net 30 terms with proactive reconciliation provisions.",
                "suggestedRevision": revised,
                "objectives": objectives
            }
        else: # balanced
            revised = "Payment of undisputed invoices shall be due within thirty (30) days of invoice receipt. Any disputed amounts shall be notified within fifteen (15) days."
            return {
                "riskSeverity": "LOW",
                "identifiedImbalance": "Standard payment terms can be refined with clear invoice dispute timelines.",
                "strategy": "Establish standard Net 30 payment with a 15-day dispute notification window.",
                "suggestedRevision": revised,
                "objectives": objectives
            }

    # Default generic clause negotiation
    revised = f"Both parties mutually agree that: {text} Each party shall act reasonably and in good faith."
    return {
        "riskSeverity": "MEDIUM",
        "identifiedImbalance": "Clause language could benefit from mutual clarity and explicit standards of commercial reasonableness.",
        "strategy": "Introduce bilateral mutuality and good-faith performance requirements.",
        "suggestedRevision": revised,
        "objectives": objectives
    }

def generate_clause_negotiation(
    document_id: str,
    clause_id: Optional[str] = None,
    clause_type: Optional[str] = None,
    mode: str = "balanced"
) -> Dict[str, Any]:
    """
    Executes Phase 2 Task 5 AI Contract Negotiation & Post-Redline Risk Recalculation:
      1. Layer 2 Isolation: Enforces clause belongs strictly to document_id (clauseId is authoritative)
      2. Retrieves immutable document full text from documents.extracted_text
      3. Gathers risk context from document_risk_factors
      4. Synthesizes strategic recommendations according to posture mode (aiRecommendation)
      5. Generates word-level redline diff (redline)
      6. Ephemerally substitutes proposed clause in memory with strict ambiguity protection
      7. Deterministically calculates before_score, after_score, risk_delta, risk_direction, findings_diff
      8. Returns quantitative metrics and truthful AI provenance (confidence.score === null)
    """
    if mode not in VALID_NEGOTIATION_MODES:
        mode = "balanced"

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Fetch immutable document text
        cur.execute("SELECT id, original_name, extracted_text, risk_score FROM documents WHERE id = %s;", (document_id,))
        doc_row = cur.fetchone()
        if not doc_row:
            return {"error": "Document not found", "status": 404}
        original_text = doc_row.get("extracted_text") or ""

        clause_row = None
        if clause_id:
            cur.execute("""
                SELECT id, document_id, segment_id, clause_type, confidence,
                       detection_method, extracted_snippet, status, effective_confidence
                FROM document_clauses
                WHERE id = %s AND document_id = %s;
            """, (clause_id, document_id))
            clause_row = cur.fetchone()
            if not clause_row:
                return {
                    "error": "Clause not found in specified document",
                    "status": 404
                }

        if not clause_row:
            # If no specific clause_id given, search for first clause matching clause_type or top risky clause
            if clause_type:
                cur.execute("""
                    SELECT id, document_id, segment_id, clause_type, confidence,
                           detection_method, extracted_snippet, status, effective_confidence
                    FROM document_clauses
                    WHERE document_id = %s AND UPPER(clause_type) = %s
                    ORDER BY confidence DESC LIMIT 1;
                """, (document_id, clause_type.upper()))
                clause_row = cur.fetchone()
            else:
                cur.execute("""
                    SELECT id, document_id, segment_id, clause_type, confidence,
                           detection_method, extracted_snippet, status, effective_confidence
                    FROM document_clauses
                    WHERE document_id = %s
                    ORDER BY confidence DESC LIMIT 1;
                """, (document_id,))
                clause_row = cur.fetchone()

        segment_context_text = None
        if not clause_row:
            # Fallback to document segment if clauses not yet indexed
            cur.execute("""
                SELECT id, document_id, title, segment_text, position
                FROM document_segments
                WHERE document_id = %s
                ORDER BY position ASC LIMIT 1;
            """, (document_id,))
            seg_fallback = cur.fetchone()
            if not seg_fallback:
                return {
                    "error": "No clauses or segments found in the specified document.",
                    "status": 404
                }
            clause_text = seg_fallback["segment_text"]
            segment_context_text = seg_fallback["segment_text"]
            resolved_clause_id = f"seg-{seg_fallback['id']}"
            resolved_type = "GENERAL_PROVISION"
            section_title = seg_fallback["title"] or f"Section {seg_fallback['position'] + 1}"
            seg_index = seg_fallback["position"]
            seg_id = str(seg_fallback["id"])
        else:
            resolved_clause_id = str(clause_row["id"])
            resolved_type = str(clause_row["clause_type"])
            clause_text = clause_row["extracted_snippet"] or ""
            seg_id = str(clause_row.get("segment_id") or "")

            section_title = "Contract Provision"
            seg_index = 0
            if seg_id:
                cur.execute("SELECT title, position, segment_text FROM document_segments WHERE id = %s;", (seg_id,))
                seg_info = cur.fetchone()
                if seg_info:
                    section_title = seg_info["title"] or f"Section {seg_info['position'] + 1}"
                    seg_index = seg_info["position"]
                    segment_context_text = seg_info.get("segment_text")
                    if not clause_text:
                        clause_text = seg_info["segment_text"]

        # Gather associated risk context
        cur.execute("""
            SELECT risk_type, reason, severity
            FROM document_risk_factors
            WHERE document_id = %s;
        """, (document_id,))
        risk_rows = cur.fetchall()
        risk_context = [f"{r['risk_type']} ({r['severity']}): {r['reason']}" for r in risk_rows]

        document_evidence = {
            "clause": clause_text,
            "section": section_title,
            "segmentIndex": seg_index,
            "sources": [
                {
                    "segmentId": seg_id,
                    "excerpt": clause_text[:300] + ("..." if len(clause_text) > 300 else "")
                }
            ]
        }

        gemini_key = get_gemini_api_key()
        active_model = get_active_gemini_model()
        ai_rec = None
        llm_used = False

        if gemini_key:
            try:
                prompt = format_negotiation_prompt(clause_text, resolved_type, mode, risk_context)
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
                        ai_rec = {
                            "riskSeverity": parsed.get("riskSeverity", "MEDIUM"),
                            "identifiedImbalance": parsed.get("identifiedImbalance", "Identified potential legal imbalance."),
                            "strategy": parsed.get("strategy", "Negotiate mutual terms."),
                            "suggestedRevision": parsed.get("suggestedRevision", clause_text),
                            "objectives": MODE_OBJECTIVES.get(mode, MODE_OBJECTIVES["balanced"])
                        }
                        llm_used = True
            except Exception:
                ai_rec = None
                llm_used = False

        if not ai_rec:
            ai_rec = synthesize_contextual_recommendation(clause_text, resolved_type, mode, risk_context)
            llm_used = False

        suggested_revision = ai_rec["suggestedRevision"]
        redline_diff = compute_word_diff(clause_text, suggested_revision)

        # In-memory ephemeral clause substitution with ambiguity protection
        modified_text, replace_ok, replace_err = construct_modified_contract_state(
            original_text=original_text,
            target_clause=clause_text,
            proposed_clause=suggested_revision,
            context_text=segment_context_text
        )
        if not replace_ok:
            return {
                "error": f"Target clause could not be safely substituted in document text: {replace_err}",
                "status": 400
            }

        # Deterministic risk recalculation
        cur.execute("""
            SELECT id, clause_type, confidence, extracted_snippet
            FROM document_clauses
            WHERE document_id = %s;
        """, (document_id,))
        all_clause_rows = cur.fetchall()
        detected_clauses = [
            {"clauseType": r["clause_type"], "confidence": float(r["confidence"] or 0.85), "snippet": r.get("extracted_snippet", "")}
            for r in all_clause_rows
        ]
        missing_clauses_info = detect_missing_clauses(detected_clauses)

        before_risk = calculate_document_risk(
            full_text=original_text,
            detected_clauses=detected_clauses,
            missing_clauses_info=missing_clauses_info
        )
        after_risk = calculate_document_risk(
            full_text=modified_text,
            detected_clauses=detected_clauses,
            missing_clauses_info=missing_clauses_info
        )

        before_score = before_risk["score"]
        before_level = before_risk["level"]
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

        if llm_used:
            prov = create_hybrid_provenance(
                provider="gemini",
                model=active_model,
                grounded=bool(document_evidence and len(document_evidence) > 0),
                evidence=document_evidence,
                confidence_score=None,
                methodology="not_available",
                retrieval_score=None,
                retrieval_methodology=None,
                fallback=False
            )
        else:
            prov = create_deterministic_provenance(
                methodology="deterministic_template",
                evidence=document_evidence,
                fallback=True
            )

        prov["riskScoring"] = {
            "engine": "deterministic-calibrated-risk-2.0",
            "authority": "rules_engine",
            "confidence": { "score": None }
        }

        return {
            "documentId": document_id,
            "clauseId": resolved_clause_id,
            "clauseType": resolved_type,
            "mode": mode,
            "originalClause": clause_text,
            "proposedClause": suggested_revision,
            "beforeScore": before_score,
            "afterScore": after_score,
            "riskDelta": risk_delta,
            "riskDirection": risk_direction,
            "beforeLevel": before_level,
            "afterLevel": after_level,
            "riskFindings": findings_diff,
            "before_score": before_score,
            "after_score": after_score,
            "risk_delta": risk_delta,
            "risk_direction": risk_direction,
            "risk_findings": findings_diff,
            "documentEvidence": document_evidence,
            "aiRecommendation": ai_rec,
            "redline": redline_diff,
            "engine": prov["engine"],
            "provider": prov["provider"],
            "model": prov["model"],
            "grounded": prov["grounded"],
            "confidence": {
                "score": None,
                "methodology": prov["confidence"]["methodology"]
            },
            "confidenceScore": None,
            "provenance": prov
        }

    finally:
        cur.close()
        conn.close()

def get_document_negotiation_opportunities(document_id: str) -> List[Dict[str, Any]]:
    """
    Scans document clauses in PostgreSQL and returns all negotiation candidate clauses.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT c.id, c.clause_type, c.confidence, c.extracted_snippet, s.title, s.position, s.segment_text
            FROM document_clauses c
            LEFT JOIN document_segments s ON c.segment_id = s.id
            WHERE c.document_id = %s
            ORDER BY c.confidence DESC;
        """, (document_id,))
        rows = cur.fetchall()

        results = []
        for r in rows:
            c_type = r["clause_type"]
            is_high_priority = c_type in ["TERMINATION", "LIABILITY", "INDEMNIFICATION", "PAYMENT", "CONFIDENTIALITY"]
            results.append({
                "clauseId": str(r["id"]),
                "clauseType": c_type,
                "section": r["title"] or f"Section {r['position'] + 1 if r.get('position') is not None else 1}",
                "snippet": r["extracted_snippet"] or r["segment_text"] or "",
                "riskLevel": "HIGH" if is_high_priority else "MEDIUM",
                "recommendedMode": "protective" if c_type in ["LIABILITY", "INDEMNIFICATION"] else "balanced"
            })
        return results
    finally:
        cur.close()
        conn.close()
