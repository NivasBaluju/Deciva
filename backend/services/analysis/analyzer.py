import uuid
import time
from typing import Dict, Any, List
from psycopg2.extras import execute_values

try:
    from backend.services.analysis.segmentation import segment_document
    from backend.services.analysis.clause_detection import detect_clauses_in_segments
    from backend.services.analysis.missing_clause import detect_missing_clauses
    from backend.services.analysis.risk_scoring import calculate_document_risk
    from backend.services.analysis.deadline_extraction import extract_deadlines_from_text
    from backend.services.analysis.ml_classifier import ml_classifier
    from backend.services.database import get_db_connection
except ImportError:
    from services.analysis.segmentation import segment_document
    from services.analysis.clause_detection import detect_clauses_in_segments
    from services.analysis.missing_clause import detect_missing_clauses
    from services.analysis.risk_scoring import calculate_document_risk
    from services.analysis.deadline_extraction import extract_deadlines_from_text
    from services.analysis.ml_classifier import ml_classifier
    from services.database import get_db_connection

MAX_SEGMENTS_CAP = 300  # Guardrail for ultra-long documents (>150 pages)

def _evaluate_hybrid_consensus(rule_clauses: List[Dict[str, Any]], segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Evaluates agreement between Rule Engine and ML Model using the robust 6-step consensus decision engine:
      STEP 1: Different labels? -> LABEL_DISAGREEMENT, UNCERTAIN, Review Required
      STEP 2: Both weak? (< 0.50) -> LOW_CONFIDENCE, UNCERTAIN, Review Required
      STEP 3: Both strong and same label? (Rule >= 0.80, ML >= 0.70) -> AGREEMENT, CONFIRMED
      STEP 4: Rule strong, ML sub-threshold? (Rule >= 0.80, ML < 0.70) -> RULE_DOMINANT_HYBRID, LIKELY_PRESENT
      STEP 5: ML strong, Rule sub-threshold? (ML >= 0.70, Rule < 0.80) -> MODEL_DOMINANT_HYBRID, LIKELY_PRESENT
      STEP 6: Everything else (Grey zone, e.g. 0.72 / 0.61 same label) -> PARTIAL_CONFIDENCE, UNCERTAIN, Review Recommended
    """
    rule_map = {c["segmentId"]: c for c in rule_clauses if "segmentId" in c}
    consensus_clauses = []

    # Safeguard against freezing: Cap total evaluated segments for massive text dumps
    eval_segments = segments[:MAX_SEGMENTS_CAP]

    for seg in eval_segments:
        seg_id = seg["id"]
        seg_text = seg.get("text", "")
        title = seg.get("title", "")
        # Truncate single segment to 2000 chars for instant vectorization
        combined_text = f"{title}\n{seg_text[:2000]}".strip()

        rule_c = rule_map.get(seg_id)
        ml_pred = ml_classifier.predict_segment(combined_text)

        rule_type = rule_c["clauseType"] if rule_c else None
        rule_conf = float(rule_c["confidence"]) if rule_c else 0.0

        ml_type = ml_pred["predictedClauseType"] if ml_pred else None
        ml_conf = float(ml_pred["modelConfidence"]) if ml_pred else 0.0

        # When both detectors have a signal:
        if rule_type and ml_type:
            if rule_type != ml_type:
                primary_clause = rule_type if rule_conf >= ml_conf else ml_type
                lead_source = "RULE_ENGINE" if rule_conf >= ml_conf else "ML_MODEL"
                eff_conf = max(rule_conf, ml_conf)

                consensus_clauses.append({
                    "segmentId": seg_id,
                    "position": seg.get("position"),
                    "title": title,
                    "clauseType": primary_clause,
                    "primaryClauseType": primary_clause,
                    "status": "UNCERTAIN",
                    "detectionMethod": "DISPUTED_HYBRID",
                    "consensus": "LABEL_DISAGREEMENT",
                    "rulePrediction": {"clauseType": rule_type, "confidence": rule_conf},
                    "modelPrediction": {"clauseType": ml_type, "confidence": ml_conf},
                    "ruleBasedConfidence": rule_conf,
                    "modelConfidence": ml_conf,
                    "primaryEvidenceSource": lead_source,
                    "effectiveConfidence": eff_conf,
                    "confidence": eff_conf,
                    "reviewRecommended": True,
                    "snippet": seg_text[:250].strip() + ("..." if len(seg_text) > 250 else "")
                })

            elif rule_conf < 0.50 and ml_conf < 0.50:
                eff_conf = max(rule_conf, ml_conf)
                consensus_clauses.append({
                    "segmentId": seg_id,
                    "position": seg.get("position"),
                    "title": title,
                    "clauseType": rule_type,
                    "status": "UNCERTAIN",
                    "detectionMethod": "HYBRID_AI",
                    "consensus": "LOW_CONFIDENCE",
                    "rulePrediction": {"clauseType": rule_type, "confidence": rule_conf},
                    "modelPrediction": {"clauseType": ml_type, "confidence": ml_conf},
                    "ruleBasedConfidence": rule_conf,
                    "modelConfidence": ml_conf,
                    "primaryEvidenceSource": "UNRESOLVED",
                    "effectiveConfidence": eff_conf,
                    "confidence": eff_conf,
                    "reviewRecommended": True,
                    "snippet": seg_text[:250].strip() + ("..." if len(seg_text) > 250 else "")
                })

            elif rule_conf >= 0.80 and ml_conf >= 0.70:
                eff_conf = round((rule_conf + ml_conf) / 2, 2)
                consensus_clauses.append({
                    "segmentId": seg_id,
                    "position": seg.get("position"),
                    "title": title,
                    "clauseType": rule_type,
                    "status": "CONFIRMED",
                    "detectionMethod": "HYBRID_AI",
                    "consensus": "AGREEMENT",
                    "rulePrediction": {"clauseType": rule_type, "confidence": rule_conf},
                    "modelPrediction": {"clauseType": ml_type, "confidence": ml_conf},
                    "ruleBasedConfidence": rule_conf,
                    "modelConfidence": ml_conf,
                    "primaryEvidenceSource": "CONSENSUS_AGREEMENT",
                    "effectiveConfidence": eff_conf,
                    "confidence": eff_conf,
                    "reviewRecommended": False,
                    "snippet": seg_text[:250].strip() + ("..." if len(seg_text) > 250 else "")
                })

            elif rule_conf >= 0.80 and ml_conf < 0.70:
                consensus_clauses.append({
                    "segmentId": seg_id,
                    "position": seg.get("position"),
                    "title": title,
                    "clauseType": rule_type,
                    "status": "LIKELY_PRESENT",
                    "detectionMethod": "RULE_DOMINANT_HYBRID",
                    "consensus": "DISAGREEMENT",
                    "rulePrediction": {"clauseType": rule_type, "confidence": rule_conf},
                    "modelPrediction": {"clauseType": ml_type, "confidence": ml_conf},
                    "ruleBasedConfidence": rule_conf,
                    "modelConfidence": ml_conf,
                    "primaryEvidenceSource": "RULE_ENGINE",
                    "effectiveConfidence": rule_conf,
                    "confidence": rule_conf,
                    "reviewRecommended": False,
                    "snippet": seg_text[:250].strip() + ("..." if len(seg_text) > 250 else "")
                })

            elif ml_conf >= 0.70 and rule_conf < 0.80:
                consensus_clauses.append({
                    "segmentId": seg_id,
                    "position": seg.get("position"),
                    "title": title,
                    "clauseType": ml_type,
                    "status": "LIKELY_PRESENT",
                    "detectionMethod": "MODEL_DOMINANT_HYBRID",
                    "consensus": "DISAGREEMENT",
                    "rulePrediction": {"clauseType": rule_type, "confidence": rule_conf},
                    "modelPrediction": {"clauseType": ml_type, "confidence": ml_conf},
                    "ruleBasedConfidence": rule_conf,
                    "modelConfidence": ml_conf,
                    "primaryEvidenceSource": "ML_MODEL",
                    "effectiveConfidence": ml_conf,
                    "confidence": ml_conf,
                    "reviewRecommended": False,
                    "snippet": seg_text[:250].strip() + ("..." if len(seg_text) > 250 else "")
                })

            else:
                eff_conf = round((rule_conf + ml_conf) / 2, 2)
                consensus_clauses.append({
                    "segmentId": seg_id,
                    "position": seg.get("position"),
                    "title": title,
                    "clauseType": rule_type,
                    "status": "UNCERTAIN",
                    "detectionMethod": "HYBRID_AI",
                    "consensus": "PARTIAL_CONFIDENCE",
                    "rulePrediction": {"clauseType": rule_type, "confidence": rule_conf},
                    "modelPrediction": {"clauseType": ml_type, "confidence": ml_conf},
                    "ruleBasedConfidence": rule_conf,
                    "modelConfidence": ml_conf,
                    "primaryEvidenceSource": "RULE_ENGINE" if rule_conf >= ml_conf else "ML_MODEL",
                    "effectiveConfidence": eff_conf,
                    "confidence": eff_conf,
                    "reviewRecommended": True,
                    "snippet": seg_text[:250].strip() + ("..." if len(seg_text) > 250 else "")
                })

        # Single-Source Fallbacks
        elif rule_type and rule_conf >= 0.50:
            status = "CONFIRMED" if rule_conf >= 0.90 else "LIKELY_PRESENT"
            consensus_clauses.append({
                "segmentId": seg_id,
                "position": seg.get("position"),
                "title": title,
                "clauseType": rule_type,
                "status": status,
                "detectionMethod": "RULE_BASED",
                "consensus": "RULE_ONLY",
                "rulePrediction": {"clauseType": rule_type, "confidence": rule_conf},
                "modelPrediction": None,
                "ruleBasedConfidence": rule_conf,
                "modelConfidence": None,
                "primaryEvidenceSource": "RULE_ENGINE",
                "effectiveConfidence": rule_conf,
                "confidence": rule_conf,
                "reviewRecommended": rule_conf < 0.70,
                "snippet": seg_text[:250].strip() + ("..." if len(seg_text) > 250 else "")
            })

        elif ml_type and ml_conf >= 0.65:
            consensus_clauses.append({
                "segmentId": seg_id,
                "position": seg.get("position"),
                "title": title,
                "clauseType": ml_type,
                "status": "LIKELY_PRESENT",
                "detectionMethod": "ML_CLASSIFIER",
                "consensus": "ML_ONLY",
                "rulePrediction": None,
                "modelPrediction": {"clauseType": ml_type, "confidence": ml_conf},
                "ruleBasedConfidence": None,
                "modelConfidence": ml_conf,
                "primaryEvidenceSource": "ML_MODEL",
                "effectiveConfidence": ml_conf,
                "confidence": ml_conf,
                "reviewRecommended": ml_conf < 0.80,
                "snippet": seg_text[:250].strip() + ("..." if len(seg_text) > 250 else "")
            })

    return consensus_clauses

def set_document_processing_status(doc_id: str, status: str, safe_error: str = None, internal_error: str = None, max_retries: int = 3):
    """
    Updates the analysis status of a document in PostgreSQL using a fresh, independent connection.
    Stores safe user-facing message in analysis_error and diagnostic trace in analysis_error_internal.
    Includes retry resilience with exponential backoff for cloud database network blips.
    Status values: 'NOT_STARTED', 'PROCESSING', 'COMPLETED', 'FAILED'
    """
    if not doc_id:
        return
    for attempt in range(max_retries):
        conn = None
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("""
                UPDATE documents 
                SET analysis_status = %s, 
                    analysis_error = %s, 
                    analysis_error_internal = %s, 
                    processed_at = CURRENT_TIMESTAMP 
                WHERE id = %s;
            """, (status, safe_error, internal_error, doc_id))
            conn.commit()
            cur.close()
            return
        except Exception as e:
            print(f"[Status Update Error Attempt {attempt+1}/{max_retries}] {e}")
            time.sleep(0.5 * (attempt + 1))
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

def get_persisted_analysis_from_db(doc_id: str) -> Dict[str, Any]:
    """
    Fetches the existing persisted analysis results for a document from PostgreSQL.
    Returns None if no previous analysis exists.
    """
    if not doc_id:
        return None
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("SELECT risk_score, analysis_status, analysis_error FROM documents WHERE id = %s;", (doc_id,))
        doc_row = cur.fetchone()
        if not doc_row:
            return None
            
        cur.execute("""
            SELECT 
                clause_type, confidence, detection_method, extracted_snippet, 
                rule_confidence, model_confidence, consensus, review_recommended, 
                status, effective_confidence, primary_evidence_source
            FROM document_clauses 
            WHERE document_id = %s;
        """, (doc_id,))
        clause_rows = cur.fetchall()
        
        if not clause_rows:
            return None
            
        cur.execute("""
            SELECT deadline_date, relative_deadline, deadline_type, source_text, confidence
            FROM document_deadlines
            WHERE document_id = %s;
        """, (doc_id,))
        deadline_rows = cur.fetchall()
        
        cur.execute("""
            SELECT risk_type, severity, reason, risk_points
            FROM document_risk_factors
            WHERE document_id = %s;
        """, (doc_id,))
        risk_rows = cur.fetchall()
        
        cur.execute("SELECT COUNT(*) FROM document_segments WHERE document_id = %s;", (doc_id,))
        seg_count = cur.fetchone()['count']
        
        cur.close()
        
        detected_clauses = [
            {
                "clauseType": r["clause_type"],
                "status": r["status"] or "LIKELY_PRESENT",
                "detectionMethod": r["detection_method"],
                "consensus": r["consensus"],
                "ruleBasedConfidence": float(r["rule_confidence"]) if r["rule_confidence"] is not None else None,
                "modelConfidence": float(r["model_confidence"]) if r["model_confidence"] is not None else None,
                "primaryEvidenceSource": r["primary_evidence_source"],
                "effectiveConfidence": float(r["effective_confidence"] or r["confidence"] or 0),
                "confidence": float(r["effective_confidence"] or r["confidence"] or 0),
                "reviewRecommended": bool(r["review_recommended"]),
                "snippet": r["extracted_snippet"]
            }
            for r in clause_rows
        ]
        
        deadlines = [
            {
                "deadlineDate": str(d["deadline_date"]) if d["deadline_date"] else None,
                "relativeDeadline": d["relative_deadline"],
                "deadlineType": d["deadline_type"],
                "sourceText": d["source_text"],
                "confidence": float(d["confidence"]) if d["confidence"] is not None else None,
                "confidenceMethodology": "calibrated_score" if d["confidence"] is not None else "deterministic_pattern_match"
            }
            for d in deadline_rows
        ]
        
        risk_factors = [
            {
                "riskType": rf["risk_type"],
                "severity": rf["severity"],
                "reason": rf["reason"],
                "riskPoints": rf["risk_points"]
            }
            for rf in risk_rows
        ]
        
        return {
            "documentId": doc_id,
            "risk": {
                "score": doc_row["risk_score"] or 0,
                "level": "HIGH" if (doc_row["risk_score"] or 0) >= 60 else "MEDIUM" if (doc_row["risk_score"] or 0) >= 30 else "LOW",
                "summary": f"Risk Score: {doc_row['risk_score']}/100"
            },
            "clauses": {
                "detected": detected_clauses,
                "missing": [],
                "auditItems": [],
                "checklistScore": len(detected_clauses)
            },
            "deadlines": deadlines,
            "riskFactors": risk_factors,
            "segmentsCount": seg_count
        }
    except Exception as e:
        print(f"[Fetch Persisted Analysis Error] {e}")
        return None
    finally:
        if conn:
            conn.close()

SAFE_ANALYSIS_ERROR_MESSAGE = "Document analysis could not be completed. Please ensure the file is valid and try again."

def analyze_document(doc_id: str, document_text: str, persist_to_db: bool = True) -> Dict[str, Any]:
    """
    Central AI Analysis Orchestrator for Deciva.
    Executes:
      1. Set status to PROCESSING
      2. Segmentation
      3. Rule-Based Clause Detection
      4. ML Inference & 6-Step Consensus Engine
      5. Missing Clause Evaluation (4-tier audit model)
      6. Deadline & Date Extraction
      7. Calibrated Risk Scoring (Decoupled Hazards vs Omissions)
      8. High-Performance PostgreSQL Batch Persistence with Strict Idempotency
      9. Set status to COMPLETED (or FAILED on error, preserving prior analysis if present)
    """
    start_time = time.time()
    
    if not document_text or not document_text.strip():
        if doc_id and persist_to_db:
            set_document_processing_status(doc_id, "COMPLETED", None, None)
        return {
            "documentId": doc_id,
            "analysisStatus": "COMPLETED",
            "hasPreviousAnalysis": False,
            "riskScore": 0,
            "risk_score": 0,
            "riskLevel": "LOW",
            "risk": {"score": 0, "level": "LOW", "summary": "Empty document"},
            "clauses": {"detected": [], "missing": []},
            "deadlines": [],
            "riskFactors": [],
            "segmentsCount": 0,
            "processingTimeMs": round((time.time() - start_time) * 1000)
        }

    try:
        if doc_id and persist_to_db:
            set_document_processing_status(doc_id, "PROCESSING")

        segments = segment_document(document_text)

        rule_detected = detect_clauses_in_segments(segments)

        detected_clauses = _evaluate_hybrid_consensus(rule_detected, segments)

        missing_clauses_info = detect_missing_clauses(detected_clauses)

        deadlines = extract_deadlines_from_text(document_text)

        risk_analysis = calculate_document_risk(
            full_text=document_text,
            detected_clauses=detected_clauses,
            missing_clauses_info=missing_clauses_info
        )

        if persist_to_db and doc_id:
            _persist_analysis_to_postgres(
                doc_id=doc_id,
                segments=segments,
                clauses=detected_clauses,
                deadlines=deadlines,
                risk_analysis=risk_analysis
            )

        elapsed_ms = round((time.time() - start_time) * 1000)

        risk_score_val = risk_analysis["score"]
        return {
            "documentId": doc_id,
            "analysisStatus": "COMPLETED",
            "hasPreviousAnalysis": True,
            "riskScore": risk_score_val,
            "risk_score": risk_score_val,
            "riskLevel": risk_analysis["level"],
            "risk": {
                "score": risk_score_val,
                "level": risk_analysis["level"],
                "totalRiskPoints": risk_analysis["totalRiskPoints"],
                "hazardPoints": risk_analysis.get("hazardPoints", 0),
                "omissionPoints": risk_analysis.get("omissionPoints", 0),
                "summary": risk_analysis["summary"]
            },
            "clauses": {
                "detected": detected_clauses,
                "missing": missing_clauses_info["missing"],
                "auditItems": missing_clauses_info.get("auditItems", []),
                "checklistScore": missing_clauses_info["checklistScore"]
            },
            "deadlines": deadlines,
            "riskFactors": risk_analysis["factors"],
            "segmentsCount": len(segments),
            "processingTimeMs": elapsed_ms
        }

    except Exception as e:
        import traceback
        internal_trace = traceback.format_exc()
        print(f"[Analysis Failure] Error analyzing document {doc_id}:\n{internal_trace}")
        
        # Check if previous analysis exists in DB
        prev_analysis = get_persisted_analysis_from_db(doc_id)
        has_prev = prev_analysis is not None
        
        safe_msg = (
            "Document analysis could not be completed. Previous analysis results are still available."
            if has_prev else
            SAFE_ANALYSIS_ERROR_MESSAGE
        )
        
        if doc_id and persist_to_db:
            set_document_processing_status(
                doc_id=doc_id, 
                status="FAILED", 
                safe_error=safe_msg, 
                internal_error=internal_trace
            )

        if has_prev and prev_analysis:
            prev_analysis.update({
                "analysisStatus": "FAILED",
                "hasPreviousAnalysis": True,
                "error": safe_msg,
                "processingTimeMs": round((time.time() - start_time) * 1000)
            })
            return prev_analysis

        return {
            "documentId": doc_id,
            "analysisStatus": "FAILED",
            "hasPreviousAnalysis": False,
            "error": safe_msg,
            "risk": {"score": 0, "level": "UNKNOWN", "summary": "Analysis failed"},
            "clauses": {"detected": [], "missing": []},
            "deadlines": [],
            "riskFactors": [],
            "segmentsCount": 0,
            "processingTimeMs": round((time.time() - start_time) * 1000)
        }

def _persist_analysis_to_postgres(doc_id: str, segments: list, clauses: list, deadlines: list, risk_analysis: dict):
    """
    Saves segmentation, clauses, deadlines, and risk factors in PostgreSQL using high-efficiency batch inserts.
    Guarantees strict idempotency without multiple network roundtrips.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("""
            UPDATE documents 
            SET risk_score = %s, 
                analysis_status = 'COMPLETED', 
                analysis_error = NULL, 
                analysis_error_internal = NULL,
                processed_at = CURRENT_TIMESTAMP 
            WHERE id = %s;
        """, (risk_analysis["score"], doc_id))

        cur.execute("DELETE FROM document_clauses WHERE document_id = %s;", (doc_id,))
        cur.execute("DELETE FROM document_deadlines WHERE document_id = %s;", (doc_id,))
        cur.execute("DELETE FROM document_risk_factors WHERE document_id = %s;", (doc_id,))
        cur.execute("DELETE FROM document_segments WHERE document_id = %s;", (doc_id,))

        seg_records = [
            (seg["id"], doc_id, seg["title"], seg["text"], seg["position"])
            for seg in segments[:MAX_SEGMENTS_CAP]
        ]
        if seg_records:
            execute_values(
                cur,
                "INSERT INTO document_segments (id, document_id, title, segment_text, position) VALUES %s;",
                seg_records
            )

        clause_records = [
            (
                str(uuid.uuid4()), doc_id, clause.get("segmentId"),
                clause["clauseType"], clause["effectiveConfidence"], clause["detectionMethod"],
                clause.get("snippet", ""), clause.get("ruleBasedConfidence"),
                clause.get("modelConfidence"), clause.get("consensus", "UNKNOWN"),
                clause.get("reviewRecommended", False), clause.get("status", "LIKELY_PRESENT"),
                clause.get("effectiveConfidence"), clause.get("primaryEvidenceSource", "RULE_ENGINE")
            )
            for clause in clauses
        ]
        if clause_records:
            execute_values(
                cur,
                """INSERT INTO document_clauses (
                    id, document_id, segment_id, clause_type, confidence, 
                    detection_method, extracted_snippet, rule_confidence, 
                    model_confidence, consensus, review_recommended, status,
                    effective_confidence, primary_evidence_source
                ) VALUES %s;""",
                clause_records
            )

        deadline_records = [
            (
                str(uuid.uuid4()), doc_id, d.get("deadlineDate"),
                d.get("relativeDeadline"), d["deadlineType"], d["sourceText"],
                d.get("confidence")
            )
            for d in deadlines
        ]
        if deadline_records:
            execute_values(
                cur,
                """INSERT INTO document_deadlines (
                    id, document_id, deadline_date, relative_deadline, deadline_type, source_text, confidence
                ) VALUES %s;""",
                deadline_records
            )

        risk_records = [
            (
                str(uuid.uuid4()), doc_id, factor["riskType"],
                factor["severity"], factor["reason"], factor["riskPoints"]
            )
            for factor in risk_analysis.get("factors", [])
        ]
        if risk_records:
            execute_values(
                cur,
                """INSERT INTO document_risk_factors (
                    id, document_id, risk_type, severity, reason, risk_points
                ) VALUES %s;""",
                risk_records
            )

        conn.commit()
        cur.close()
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"[Analysis Persistence Error] {e}")
        raise e
    finally:
        if conn:
            conn.close()
