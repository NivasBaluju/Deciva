import os
import re
import json
import urllib.request
from typing import Dict, Any, List, Optional
from datetime import datetime, date

try:
    from backend.services.database import get_db_connection
    from backend.services.analysis.analyzer import analyze_document
    from backend.services.negotiation_service import get_document_negotiation_opportunities
except ImportError:
    from services.database import get_db_connection
    from services.analysis.analyzer import analyze_document
    from services.negotiation_service import get_document_negotiation_opportunities

AUTOMATED_ANALYSIS_DISCLAIMER = "Potential inconsistency detected by automated analysis — not a legal conclusion."
INTELLIGENCE_DISCLAIMER = "This intelligence assessment is generated based on detected contract provisions and does not constitute formal legal advice."

# Maximum contributions per scoring dimension (naturally bounds sum to 100)
SCORE_WEIGHTS = {
    "clause_severity": {
        "CRITICAL": 35,
        "HIGH": 35,
        "MEDIUM": 20,
        "LOW": 5,
        "NONE": 0
    },
    "negotiation_imbalance": {
        "HIGH": 20,
        "MEDIUM": 10,
        "LOW": 0
    },
    "simulation_exposure": {
        "HIGH": 20,
        "MEDIUM": 12,
        "LOW": 5,
        "NONE": 0
    },
    "deadline_urgency": {
        "URGENT": 15,     # <= 14 days or imminent
        "MODERATE": 10,   # 15 - 30 days
        "STANDARD": 5,    # > 30 days
        "NONE": 0
    },
    "compliance_hazard": {
        "CRITICAL": 10,   # Missing core protective clause (Liability, Termination, etc.)
        "SECONDARY": 5,  # Missing secondary clause (Force Majeure, etc.)
        "NONE": 0
    }
}

def _detect_contract_conflicts(document_text: str, segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Deterministic rule and heuristic-based contradiction & inconsistency detector.
    Scans for conflicting payment windows, notice durations, governing jurisdictions,
    and liability-indemnity tensions across different contract sections.
    """
    conflicts = []
    text_lower = (document_text or "").lower()

    # e.g., "within 30 days" in one place and "within 15 days" in another
    payment_terms = []
    for seg in segments:
        seg_text = seg.get("segment_text") or seg.get("text") or ""
        sec_title = seg.get("title") or f"Section {seg.get('position', 1)}"
        matches = re.findall(r'(?:payable|due|payment|invoices?)\s+(?:within|in|net)\s+(\d{1,3})\s*days?', seg_text, re.IGNORECASE)
        for m in matches:
            days = int(m)
            payment_terms.append({"days": days, "section": sec_title, "excerpt": seg_text[:200].strip()})

    unique_days = {p["days"] for p in payment_terms}
    if len(unique_days) > 1:
        evidence_list = []
        for p in payment_terms:
            evidence_list.append({
                "section": p["section"],
                "excerpt": p["excerpt"],
                "identifiedValue": f"{p['days']} days"
            })
        conflicts.append({
            "id": f"conflict-pay-{len(conflicts)+1}",
            "conflictType": "PAYMENT_TERMS_DISCREPANCY",
            "title": "Conflicting Payment Timelines",
            "description": f"Payment terms appear inconsistent across provisions ({', '.join(f'{d} days' for d in sorted(unique_days))}).",
            "evidence": evidence_list,
            "recommendation": "Review and reconcile invoice payment terms across all referenced sections before execution.",
            "disclaimer": AUTOMATED_ANALYSIS_DISCLAIMER
        })

    notice_terms = []
    for seg in segments:
        seg_text = seg.get("segment_text") or seg.get("text") or ""
        sec_title = seg.get("title") or f"Section {seg.get('position', 1)}"
        matches = re.findall(r'(\d{1,3})\s*days?[\'\"]?\s*(?:prior\s*)?written\s+notice', seg_text, re.IGNORECASE)
        for m in matches:
            days = int(m)
            notice_terms.append({"days": days, "section": sec_title, "excerpt": seg_text[:200].strip()})

    unique_notices = {n["days"] for n in notice_terms}
    if len(unique_notices) > 1 and max(unique_notices) - min(unique_notices) >= 15:
        evidence_list = []
        for n in notice_terms:
            evidence_list.append({
                "section": n["section"],
                "excerpt": n["excerpt"],
                "identifiedValue": f"{n['days']} days notice"
            })
        conflicts.append({
            "id": f"conflict-notice-{len(conflicts)+1}",
            "conflictType": "NOTICE_PERIOD_MISMATCH",
            "title": "Discrepancy in Notice Requirements",
            "description": f"Different provisions specify diverging notice windows ({', '.join(f'{d} days' for d in sorted(unique_notices))}).",
            "evidence": evidence_list,
            "recommendation": "Harmonize notice periods between general notice clauses and breach/termination cure windows.",
            "disclaimer": AUTOMATED_ANALYSIS_DISCLAIMER
        })

    jurisdiction_matches = re.findall(r'(?:laws\s+of\s+the\s+state\s+of|governed\s+by\s+the\s+laws\s+of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)', document_text or "")
    if len(set(jurisdiction_matches)) > 1:
        conflicts.append({
            "id": f"conflict-gov-{len(conflicts)+1}",
            "conflictType": "GOVERNING_LAW_AMBIGUITY",
            "title": "Multiple Governing Jurisdictions Identified",
            "description": f"Contract references multiple governing jurisdictions ({', '.join(set(jurisdiction_matches))}).",
            "evidence": [{"section": "Governing Law / Jurisdiction", "identifiedValue": j} for j in set(jurisdiction_matches)],
            "recommendation": "Specify a single authoritative choice-of-law and dispute resolution forum.",
            "disclaimer": AUTOMATED_ANALYSIS_DISCLAIMER
        })

    has_cap = bool(re.search(r'(?i)\b(aggregate\s+liability\s+(?:shall\s+not\s+exceed|capped\s+at)|maximum\s+cumulative\s+liability)\b', text_lower))
    has_unlimited_indemnity = bool(re.search(r'(?i)\b(indemnify.*hold\s+harmless.*all\s+claims|unlimited\s+indemnif)\b', text_lower))
    has_indemnity_carveout = bool(re.search(r'(?i)\b(excluding.*indemnif|except\s+for.*indemnif|indemnif.*shall\s+not\s+be\s+subject\s+to.*cap)\b', text_lower))

    if has_cap and has_unlimited_indemnity and not has_indemnity_carveout:
        conflicts.append({
            "id": f"conflict-liab-{len(conflicts)+1}",
            "conflictType": "LIABILITY_INDEMNITY_FRICTION",
            "title": "Liability Cap & Indemnification Ambiguity",
            "description": "The agreement specifies an aggregate liability cap but does not explicitly clarify whether third-party indemnity obligations are subject to or excluded from the cap.",
            "evidence": [
                {"section": "Limitation of Liability", "excerpt": "Aggregate liability limitation identified."},
                {"section": "Indemnification", "excerpt": "Broad indemnity obligation identified without clear cap alignment."}
            ],
            "recommendation": "Insert explicit language clarifying whether indemnification claims are included within or excluded from the aggregate liability limitation.",
            "disclaimer": AUTOMATED_ANALYSIS_DISCLAIMER
        })

    return conflicts

def compute_contract_intelligence(document_id: str) -> Dict[str, Any]:
    """
    Pure deterministic intelligence computation engine.
    Reads document evidence from PostgreSQL, executes deterministic scoring,
    constructs machine-readable provenance, detects contradictions, and prepares
    the Executive Contract Intelligence Action Plan.
    """
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        cur.execute("SELECT id, original_name, filename, extracted_text, risk_score, created_at FROM documents WHERE id = %s;", (document_id,))
        doc_row = cur.fetchone()
        if not doc_row:
            return {"error": "Document not found", "status": 404}

        extracted_text = doc_row["extracted_text"] or ""
        doc_title = doc_row["original_name"] or doc_row["filename"] or "Contract"

        cur.execute("""
            SELECT c.id, c.clause_type, c.confidence, c.extracted_snippet, c.detection_method,
                   s.id AS segment_id, s.title AS section_title, s.position AS section_position, s.segment_text
            FROM document_clauses c
            LEFT JOIN document_segments s ON c.segment_id = s.id
            WHERE c.document_id = %s
            ORDER BY c.confidence DESC;
        """, (document_id,))
        clause_rows = cur.fetchall()

        cur.execute("SELECT id, title, position, segment_text FROM document_segments WHERE document_id = %s ORDER BY position ASC;", (document_id,))
        segment_rows = cur.fetchall()

        cur.execute("SELECT id, risk_type, severity, reason, risk_points FROM document_risk_factors WHERE document_id = %s ORDER BY risk_points DESC;", (document_id,))
        risk_rows = cur.fetchall()

        cur.execute("SELECT id, deadline_date, relative_deadline, deadline_type, source_text, confidence FROM document_deadlines WHERE document_id = %s ORDER BY deadline_date ASC NULLS LAST;", (document_id,))
        deadline_rows = cur.fetchall()

        cur.execute("SELECT id, scenario, grounded, document_evidence, simulation_analysis, risk_level, created_at FROM contract_simulations WHERE document_id = %s ORDER BY created_at DESC;", (document_id,))
        simulation_rows = cur.fetchall()

        # Fallback to analyzer if clauses or risk factors are empty (e.g. newly ingested document)
        if not clause_rows or not risk_rows:
            analysis = analyze_document(doc_id=document_id, document_text=extracted_text, persist_to_db=False)
            missing_clauses = analysis.get("clauses", {}).get("missing", [])
        else:
            missing_clauses = []
            # Check missing standard clauses
            detected_types = {r["clause_type"] for r in clause_rows}
            core_check = ["TERMINATION", "LIMITATION_OF_LIABILITY", "CONFIDENTIALITY", "GOVERNING_LAW", "INDEMNIFICATION"]
            for ct in core_check:
                if ct not in detected_types and not any(ct in t for t in detected_types):
                    missing_clauses.append({"clauseType": ct, "severity": "HIGH", "reason": f"Standard {ct.replace('_', ' ').title()} protection is omitted."})

        # Fetch negotiation candidate insights
        try:
            negotiation_opps = get_document_negotiation_opportunities(document_id)
        except Exception:
            negotiation_opps = []

        opp_map = {o["clauseType"]: o for o in negotiation_opps}

        conflicts = _detect_contract_conflicts(extracted_text, segment_rows or [])

        action_items = []
        action_idx = 1

        # Process Detected Clauses
        for clause in clause_rows:
            c_id = str(clause["id"])
            c_type = clause["clause_type"] or "GENERAL"
            snippet = clause["extracted_snippet"] or clause["segment_text"] or ""
            sec_title = clause["section_title"] or f"Section {(clause['section_position'] or 0) + 1}"
            
            # Match associated risk factors
            matched_risks = [r for r in risk_rows if c_type in (r["risk_type"] or "") or (r["risk_type"] or "") in c_type or any(k in (r["reason"] or "").upper() for k in c_type.split('_'))]
            matched_risk_ids = [str(r["id"]) for r in matched_risks]
            
            # Match associated deadlines
            matched_deadlines = [d for d in deadline_rows if any(k in (d["source_text"] or "").upper() for k in c_type.split('_')) or (d["deadline_type"] or "").upper() in c_type]
            matched_deadline_ids = [str(d["id"]) for d in matched_deadlines]

            # Match associated simulations
            matched_sims = [s for s in simulation_rows if any(k in (s["scenario"] or "").upper() for k in c_type.split('_')) or any(k in json.dumps(s.get("document_evidence") or {}).upper() for k in c_type.split('_'))]
            matched_sim_ids = [str(s["id"]) for s in matched_sims]

            # A. Calculate Clause Severity Score (max 35)
            highest_risk_sev = "LOW"
            if matched_risks:
                sev_set = {r["severity"].upper() for r in matched_risks}
                if "CRITICAL" in sev_set or "HIGH" in sev_set:
                    highest_risk_sev = "HIGH"
                elif "MEDIUM" in sev_set:
                    highest_risk_sev = "MEDIUM"
            elif c_type in ["TERMINATION", "LIABILITY", "INDEMNIFICATION", "INTELLECTUAL_PROPERTY"]:
                highest_risk_sev = "HIGH"
            elif c_type in ["PAYMENT", "CONFIDENTIALITY", "WARRANTY", "NON_COMPETE"]:
                highest_risk_sev = "MEDIUM"
            else:
                highest_risk_sev = "LOW"

            score_clause_sev = SCORE_WEIGHTS["clause_severity"].get(highest_risk_sev, 5)

            # B. Calculate Negotiation Imbalance Score (max 20)
            opp = opp_map.get(c_type)
            is_unilateral = bool(re.search(r'(?i)\b(unilateral|sole\s+discretion|at\s+any\s+time\s+without|without\s+notice|uncapped|no\s+liability\s+cap)\b', snippet))
            if is_unilateral or (opp and opp.get("riskLevel") == "HIGH"):
                score_neg_imbalance = SCORE_WEIGHTS["negotiation_imbalance"]["HIGH"]
                neg_posture_text = "Unilateral / asymmetric terms detected — protective redline strongly recommended"
            elif opp:
                score_neg_imbalance = SCORE_WEIGHTS["negotiation_imbalance"]["MEDIUM"]
                neg_posture_text = "Standard negotiation opportunities identified to optimize mutual terms"
            else:
                score_neg_imbalance = SCORE_WEIGHTS["negotiation_imbalance"]["LOW"]
                neg_posture_text = "Terms appear balanced under baseline parameters"

            # C. Calculate Simulation Exposure Score (max 20)
            sim_exposure_level = "NONE"
            sim_impact_text = "No active simulation scenarios linked to this provision"
            if matched_sims:
                high_sims = [s for s in matched_sims if s.get("risk_level") == "HIGH"]
                med_sims = [s for s in matched_sims if s.get("risk_level") == "MEDIUM"]
                if high_sims:
                    sim_exposure_level = "HIGH"
                    score_sim_exp = SCORE_WEIGHTS["simulation_exposure"]["HIGH"]
                    sim_impact_text = f"Simulated contingency scenario '{high_sims[0]['scenario'][:60]}...' indicates HIGH operational/legal exposure"
                elif med_sims:
                    sim_exposure_level = "MEDIUM"
                    score_sim_exp = SCORE_WEIGHTS["simulation_exposure"]["MEDIUM"]
                    sim_impact_text = f"Simulation indicates moderate risk under stress scenario '{med_sims[0]['scenario'][:60]}...'"
                else:
                    sim_exposure_level = "LOW"
                    score_sim_exp = SCORE_WEIGHTS["simulation_exposure"]["LOW"]
                    sim_impact_text = "Simulation indicates low residual risk"
            else:
                # Inferred baseline contingency impact
                if c_type in ["TERMINATION", "LIABILITY"]:
                    score_sim_exp = 15
                    sim_exposure_level = "MEDIUM"
                    sim_impact_text = "Contingency assessment: immediate execution or default scenario produces significant exposure"
                elif c_type in ["PAYMENT", "CONFIDENTIALITY"]:
                    score_sim_exp = 8
                    sim_exposure_level = "LOW"
                    sim_impact_text = "Contingency assessment: late compliance triggers penalty or cure obligations"
                else:
                    score_sim_exp = 0

            # D. Calculate Deadline Urgency Score (max 15)
            score_deadline_urg = 0
            deadline_impact_text = "No immediate timing constraints linked"
            if matched_deadlines:
                # Check for tight relative or hard deadline
                has_short_window = any("14" in (d.get("relative_deadline") or "") or "15" in (d.get("relative_deadline") or "") or "immediate" in (d.get("relative_deadline") or "").lower() for d in matched_deadlines)
                has_med_window = any("30" in (d.get("relative_deadline") or "") or "45" in (d.get("relative_deadline") or "") for d in matched_deadlines)
                if has_short_window:
                    score_deadline_urg = SCORE_WEIGHTS["deadline_urgency"]["URGENT"]
                    deadline_impact_text = "Urgent compliance/notice window (<= 14 days) identified"
                elif has_med_window:
                    score_deadline_urg = SCORE_WEIGHTS["deadline_urgency"]["MODERATE"]
                    deadline_impact_text = "Standard 30-day notice/payment window applies"
                else:
                    score_deadline_urg = SCORE_WEIGHTS["deadline_urgency"]["STANDARD"]
                    deadline_impact_text = "Standard contractual timeline"
            elif "PAYMENT" in c_type:
                score_deadline_urg = 10
                deadline_impact_text = "Recurring commercial payment cycle obligations"

            # E. Calculate Compliance / Missing Hazard Score (max 10)
            score_compliance = 0
            if c_type in ["INDEMNIFICATION", "LIABILITY"] and is_unilateral:
                score_compliance = SCORE_WEIGHTS["compliance_hazard"]["CRITICAL"]
            elif highest_risk_sev == "HIGH":
                score_compliance = SCORE_WEIGHTS["compliance_hazard"]["SECONDARY"]

            # Compute Total Naturally Bounded Priority Score
            total_score = min(100, score_clause_sev + score_neg_imbalance + score_sim_exp + score_deadline_urg + score_compliance)

            if total_score >= 80:
                cat = "CRITICAL"
                sev = "HIGH"
            elif total_score >= 60:
                cat = "IMPORTANT"
                sev = "MEDIUM"
            elif total_score >= 35:
                cat = "MONITORING"
                sev = "LOW"
            else:
                cat = "HEALTHY"
                sev = "LOW"

            # Generate recommended action & reasoning
            c_name = c_type.replace('_', ' ').title()
            if "TERMINATION" in c_type:
                rec_action = "Renegotiate termination clause to establish bilateral rights and a mandatory 30-day cure period."
                why_matters = "Unilateral or unrestricted exit rights expose operations to abrupt contract cancellation and lost revenue."
                action_type = "RENEGOTIATE"
            elif "LIABILITY" in c_type:
                rec_action = "Insert mutual liability limitation cap (equal to 12 months trailing fees) and exclude consequential damages."
                why_matters = "Uncapped or unilateral liability creates unbounded balance sheet exposure in the event of dispute."
                action_type = "AMEND"
            elif "INDEMNIFICATION" in c_type:
                rec_action = "Scope indemnification strictly to direct, third-party claims arising from gross negligence or willful misconduct."
                why_matters = "Overly broad indemnity can force your organization to fund counterparty legal defense even for indirect claims."
                action_type = "RENEGOTIATE"
            elif "PAYMENT" in c_type:
                rec_action = "Confirm payment schedule and verify that interest penalties include standard grace and dispute notice periods."
                why_matters = "Strict payment timelines can trigger technical default and accrued penalty interest upon billing disputes."
                action_type = "VERIFY"
            elif "CONFIDENTIALITY" in c_type:
                rec_action = "Ensure confidentiality obligations are mutual with standard exceptions (public domain, legal compulsion)."
                why_matters = "Proprietary information must be protected with clear remedies without conceding unreasonable injunctive burdens."
                action_type = "MONITOR"
            else:
                rec_action = f"Review {c_name} terms to ensure operational compliance and standard risk allocation."
                why_matters = f"Regular auditing of {c_name} provisions prevents unforeseen contractual obligations."
                action_type = "REVIEW"

            # Assemble Schema Strict Fact vs AI Separation
            action_items.append({
                "actionId": f"act-{c_type.lower()}-{action_idx}",
                "title": f"Review {c_name} Provision" if cat != "CRITICAL" else f"Renegotiate {c_name} Provision",
                "category": cat,
                "priorityScore": total_score,
                "priorityBreakdown": {
                    "clauseSeverity": score_clause_sev,
                    "negotiationImbalance": score_neg_imbalance,
                    "simulationExposure": score_sim_exp,
                    "deadlineUrgency": score_deadline_urg,
                    "complianceHazard": score_compliance,
                    "total": total_score
                },
                "provenance": {
                    "clauseIds": [c_id],
                    "riskFactorIds": matched_risk_ids,
                    "simulationIds": matched_sim_ids,
                    "deadlineIds": matched_deadline_ids
                },
                "documentEvidence": {
                    "clauseType": c_type,
                    "section": sec_title,
                    "excerpt": snippet[:350].strip() + ("..." if len(snippet) > 350 else ""),
                    "sources": [
                        {
                            "section": sec_title,
                            "snippet": snippet[:250].strip()
                        }
                    ],
                    "deadlines": [d.get("source_text", "") for d in matched_deadlines],
                    "risks": [r.get("reason", "") for r in matched_risks]
                },
                "intelligenceAssessment": {
                    "priorityScore": total_score,
                    "severity": sev,
                    "whyItMatters": why_matters,
                    "recommendedAction": rec_action,
                    "crossFeatureInsights": {
                        "clauseFinding": f"{c_name} identified with {highest_risk_sev.lower()} risk profile",
                        "negotiationPosture": neg_posture_text,
                        "simulationImpact": sim_impact_text,
                        "deadlineImpact": deadline_impact_text
                    },
                    "actionCategory": action_type,
                    "disclaimer": INTELLIGENCE_DISCLAIMER
                }
            })
            action_idx += 1

        # Process Missing Clauses (Compliance Hazard items)
        for mc in missing_clauses:
            m_type = mc.get("clauseType") or "CORE_CLAUSE"
            m_sev = mc.get("severity") or "HIGH"
            m_name = m_type.replace('_', ' ').title()
            
            score_comp = 10 if m_sev == "HIGH" else 5
            score_clause_sev = 20 if m_sev == "HIGH" else 10
            total_score = min(100, score_clause_sev + score_comp + 10)
            
            cat = "CRITICAL" if total_score >= 80 else ("IMPORTANT" if total_score >= 60 else "MONITORING")

            action_items.append({
                "actionId": f"act-missing-{action_idx}",
                "title": f"Insert Missing {m_name} Clause",
                "category": cat,
                "priorityScore": total_score,
                "priorityBreakdown": {
                    "clauseSeverity": score_clause_sev,
                    "negotiationImbalance": 10,
                    "simulationExposure": 0,
                    "deadlineUrgency": 0,
                    "complianceHazard": score_comp,
                    "total": total_score
                },
                "provenance": {
                    "clauseIds": [],
                    "riskFactorIds": [],
                    "simulationIds": [],
                    "deadlineIds": []
                },
                "documentEvidence": {
                    "clauseType": m_type,
                    "section": "Document Body (Omission)",
                    "excerpt": f"Document lacks an express {m_name} clause.",
                    "sources": [],
                    "deadlines": [],
                    "risks": [mc.get("reason") or f"Absence of {m_name} leaves critical exposure unmitigated."]
                },
                "intelligenceAssessment": {
                    "priorityScore": total_score,
                    "severity": m_sev,
                    "whyItMatters": f"Without a standard {m_name} clause, default statutory or common-law standards apply, creating uncontained liability.",
                    "recommendedAction": f"Draft and incorporate standard balanced {m_name} language.",
                    "crossFeatureInsights": {
                        "clauseFinding": f"Clause omission: {m_name} not detected in agreement",
                        "negotiationPosture": "Protective inclusion required",
                        "simulationImpact": "Absence of terms removes contractual defenses",
                        "deadlineImpact": "No deadlines assigned"
                    },
                    "actionCategory": "INSERT",
                    "disclaimer": INTELLIGENCE_DISCLAIMER
                }
            })
            action_idx += 1

        # Sort action items descending by priorityScore deterministically
        action_items.sort(key=lambda x: x["priorityScore"], reverse=True)

        critical_items = [a for a in action_items if a["category"] == "CRITICAL"]
        important_items = [a for a in action_items if a["category"] == "IMPORTANT"]
        monitoring_items = [a for a in action_items if a["category"] == "MONITORING"]
        healthy_items = [a for a in action_items if a["category"] == "HEALTHY"]

        # Health score formula: bounded between 5 and 100
        risk_penalty = (len(critical_items) * 15) + (len(important_items) * 8) + (len(monitoring_items) * 3) + (len(conflicts) * 10)
        health_score = max(5, min(100, 100 - risk_penalty))

        # Generate human-readable executive narrative grounded strictly in verified findings
        top_crit = critical_items[0] if critical_items else (important_items[0] if important_items else None)
        top_focus = top_crit['title'] if top_crit else "Standard contract terms"
        top_why = top_crit['intelligenceAssessment']['whyItMatters'] if top_crit else "provisions appear aligned with standard practices"

        exec_summary = (
            f"Contract Health Score is {health_score}/100 with {len(critical_items)} critical action item(s), "
            f"{len(important_items)} important obligation(s), and {len(monitoring_items)} monitoring point(s). "
            f"{f'Additionally, {len(conflicts)} potential contractual contradiction(s) were flagged for legal reconciliation. ' if conflicts else ''}"
            f"The primary focus item is '{top_focus}' because {top_why[:150].lower()}."
        )

        return {
            "documentId": document_id,
            "documentTitle": doc_title,
            "healthScore": health_score,
            "metrics": {
                "criticalCount": len(critical_items),
                "importantCount": len(important_items),
                "monitoringCount": len(monitoring_items),
                "healthyCount": len(healthy_items),
                "conflictsCount": len(conflicts),
                "totalActionItems": len(action_items)
            },
            "executiveSummary": exec_summary,
            "conflicts": conflicts,
            "actionPlan": action_items,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "disclaimer": INTELLIGENCE_DISCLAIMER
        }

    finally:
        cur.close()
        conn.close()
