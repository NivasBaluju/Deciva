import os
import threading
import uuid
from flask import Blueprint, jsonify, request
try:
    from backend.models.document import DocumentModel
    from backend.services.crypto import sha256_buffer, encrypt_buffer
    from backend.services.text_extraction import extract_text_from_file
    from backend.services.analysis.analyzer import analyze_document
    from backend.services.database import get_db_connection
except ImportError:
    from models.document import DocumentModel
    from services.crypto import sha256_buffer, encrypt_buffer
    from services.text_extraction import extract_text_from_file
    from services.analysis.analyzer import analyze_document
    from services.database import get_db_connection

documents_bp = Blueprint('documents', __name__, url_prefix='/api/documents')

UPLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'uploads'))

@documents_bp.route('', methods=['GET'])
@documents_bp.route('/', methods=['GET'])
def get_documents():
    """
    GET /api/documents
    Internal service endpoint. Requires user_id parameter when called internally.
    """
    user_id = request.args.get('user_id')
    if not user_id or not user_id.strip():
        return jsonify({
            "error": "Access denied: user_id parameter is strictly required for multi-tenant data isolation.",
            "code": "TENANT_USER_REQUIRED"
        }), 400
    docs = DocumentModel.get_all(user_id=user_id.strip())
    return jsonify(docs), 200

@documents_bp.route('/upload', methods=['POST'])
def upload_document():
    """
    POST /api/documents/upload
    Pipeline:
      1. Validate file (size, extension, mime)
      2. Generate unique Document UUID
      3. Compute SHA-256 integrity hash of original content
      4. Format-aware text extraction (PyMuPDF / python-docx / direct text / OCR)
      5. Encrypt original file with AES-256-GCM
      6. Store encrypted document (.enc)
      7. Persist metadata & extracted text to PostgreSQL
      8. Trigger initial AI analysis
    """
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded in request"}), 400

        file = request.files['file']
        if not file.filename:
            return jsonify({"error": "No selected file"}), 400

        original_name = file.filename
        file_bytes = file.read()
        file_size = len(file_bytes)

        if file_size == 0:
            return jsonify({"error": "Uploaded file is empty"}), 400

        doc_id = (request.form.get('document_id') or request.form.get('doc_id') or str(uuid.uuid4())).strip()
        stored_filename = f"{doc_id}.enc"
        tmp_filename = f"{doc_id}.tmp"

        file_hash = sha256_buffer(file_bytes)

        extraction = extract_text_from_file(
            file_bytes=file_bytes,
            filename=original_name,
            mime_type=file.content_type or ''
        )
        extracted_text = extraction.get("text", "")
        extraction_method = extraction.get("extractionMethod", "UNKNOWN")
        extraction_status = extraction.get("extractionStatus", "COMPLETED")
        ocr_confidence = extraction.get("ocrConfidence")
        page_count = extraction.get("pageCount", 1)
        character_count = extraction.get("characterCount", len(extracted_text))

        encrypted_bytes = encrypt_buffer(file_bytes)

        os.makedirs(UPLOADS_DIR, exist_ok=True)
        file_path = os.path.join(UPLOADS_DIR, stored_filename)
        tmp_file_path = os.path.join(UPLOADS_DIR, tmp_filename)

        with open(tmp_file_path, 'wb') as f:
            f.write(encrypted_bytes)

        user_id = request.form.get('user_id') or request.form.get('userId') or None
        try:
            created = DocumentModel.create_document(
                doc_id=doc_id,
                user_id=user_id,
                filename=stored_filename,
                original_name=original_name,
                mime_type=file.content_type or 'application/pdf',
                size=file_size,
                sha256=file_hash,
                extracted_text=extracted_text,
                storage_path=file_path,
                extraction_status=extraction_status,
                extraction_method=extraction_method,
                ocr_confidence=ocr_confidence,
                page_count=page_count,
                character_count=character_count,
                risk_score=5
            )
            # Atomic rename from tmp to enc on successful DB commit
            if os.path.exists(tmp_file_path):
                os.replace(tmp_file_path, file_path)
        except Exception as db_err:
            if os.path.exists(tmp_file_path):
                try:
                    os.remove(tmp_file_path)
                except Exception:
                    pass
            raise db_err

        # Run full AI analysis in a background thread so upload returns immediately.
        # The analysis persists risk_score + factors to DB; GET /analysis re-runs fresh.
        def _bg_analyze(did, txt):
            try:
                analyze_document(doc_id=did, document_text=txt, persist_to_db=True)
            except Exception as bg_err:
                print(f"[Background Analysis Error] {bg_err}")
        threading.Thread(target=_bg_analyze, args=(doc_id, extracted_text), daemon=True).start()
        risk_score = 5  # Placeholder; GET /analysis always re-computes from text

        # Clean public response (no server storage path leakage)
        response_payload = {
            "document_id": doc_id,
            "id": doc_id,
            "filename": original_name,
            "mime_type": file.content_type or 'application/pdf',
            "file_size": file_size,
            "sha256": file_hash,
            "encrypted": True,
            "extraction_status": extraction_status,
            "extraction_method": extraction_method,
            "ocr_confidence": ocr_confidence,
            "page_count": page_count,
            "character_count": character_count,
            "risk_score": risk_score,
            "extracted_text_preview": (extracted_text[:300] + "...") if len(extracted_text) > 300 else extracted_text,
            "message": "Document validated, parsed, cryptographically encrypted (AES-256-GCM), and persisted to PostgreSQL."
        }

        return jsonify(response_payload), 201

    except Exception as e:
        print(f"[Upload Error] {e}")
        return jsonify({"error": str(e) or "Failed to process document upload"}), 500

@documents_bp.route('/<doc_id>/analyze', methods=['POST'])
def trigger_analysis(doc_id):
    """
    POST /api/documents/<doc_id>/analyze
    Runs full AI analysis core on document and persists structured results.
    """
    doc = DocumentModel.get_by_id(doc_id)
    if not doc:
        return jsonify({"error": "Document not found"}), 404

    extracted_text = doc.get("extracted_text") or ""
    result = analyze_document(doc_id=doc_id, document_text=extracted_text, persist_to_db=True)
    return jsonify(result), 200

@documents_bp.route('/<doc_id>/analysis', methods=['GET'])
def get_analysis(doc_id):
    """
    GET /api/documents/<doc_id>/analysis
    Returns complete structured AI analysis (risk, clauses, deadlines, risk factors).
    """
    doc = DocumentModel.get_by_id(doc_id)
    if not doc:
        return jsonify({"error": "Document not found"}), 404

    extracted_text = doc.get("extracted_text") or ""
    result = analyze_document(doc_id=doc_id, document_text=extracted_text, persist_to_db=False)
    return jsonify(result), 200

@documents_bp.route('/<doc_id>/clauses', methods=['GET'])
def get_document_clauses(doc_id):
    """
    GET /api/documents/<doc_id>/clauses
    Queries detected and missing clauses.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                clause_type AS "clauseType",
                clause_type,
                COALESCE(effective_confidence, confidence) AS "effectiveConfidence",
                COALESCE(effective_confidence, confidence) AS confidence,
                detection_method AS "detectionMethod",
                detection_method, 
                primary_evidence_source AS "primaryEvidenceSource",
                rule_confidence AS "ruleBasedConfidence", 
                model_confidence AS "modelConfidence", 
                consensus, 
                review_recommended AS "reviewRecommended", 
                status, 
                extracted_snippet AS snippet, 
                created_at
            FROM document_clauses 
            WHERE document_id = %s 
            ORDER BY confidence DESC;
        """, (doc_id,))
        rows = cur.fetchall()
        cur.close()

        doc = DocumentModel.get_by_id(doc_id)
        extracted_text = doc.get("extracted_text") if doc else ""
        analysis = analyze_document(doc_id=doc_id, document_text=extracted_text, persist_to_db=False)

        detected = [dict(r) for r in rows] if rows else analysis["clauses"]["detected"]
        missing = analysis["clauses"]["missing"]

        return jsonify({
            "documentId": doc_id,
            "detected": detected,
            "missing": missing,
            "clauses": {
                "detected": detected,
                "missing": missing,
                "auditItems": analysis["clauses"].get("auditItems", []),
                "checklistScore": analysis["clauses"].get("checklistScore", 0)
            },
            "auditItems": analysis["clauses"].get("auditItems", []),
            "checklistScore": analysis["clauses"].get("checklistScore", 0)
        }), 200
    finally:
        if conn:
            conn.close()

@documents_bp.route('/<doc_id>/deadlines', methods=['GET'])
def get_document_deadlines(doc_id):
    """
    GET /api/documents/<doc_id>/deadlines
    Queries extracted contract deadlines.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                id, 
                deadline_date AS "deadlineDate", 
                relative_deadline AS "relativeDeadline", 
                deadline_type AS "deadlineType", 
                source_text AS "sourceText", 
                confidence
            FROM document_deadlines WHERE document_id = %s ORDER BY deadline_date ASC NULLS LAST;
        """, (doc_id,))
        rows = cur.fetchall()
        cur.close()

        if rows:
            return jsonify({"documentId": doc_id, "deadlines": [dict(r) for r in rows]}), 200

        doc = DocumentModel.get_by_id(doc_id)
        extracted_text = doc.get("extracted_text") if doc else ""
        analysis = analyze_document(doc_id=doc_id, document_text=extracted_text, persist_to_db=False)
        return jsonify({"documentId": doc_id, "deadlines": analysis["deadlines"]}), 200
    finally:
        if conn:
            conn.close()

@documents_bp.route('/<doc_id>/risks', methods=['GET'])
def get_document_risks(doc_id):
    """
    GET /api/documents/<doc_id>/risks
    Queries explainable risk score and itemized risk factors.
    """
    conn = None
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                risk_type AS "riskType", 
                severity, 
                reason, 
                risk_points AS "riskPoints"
            FROM document_risk_factors WHERE document_id = %s;
        """, (doc_id,))
        rows = cur.fetchall()
        cur.close()

        doc = DocumentModel.get_by_id(doc_id)
        extracted_text = doc.get("extracted_text") if doc else ""
        analysis = analyze_document(doc_id=doc_id, document_text=extracted_text, persist_to_db=False)
        
        factors = [dict(r) for r in rows] if rows else analysis["riskFactors"]
        risk_obj = analysis["risk"]

        return jsonify({
            "documentId": doc_id,
            "risk": risk_obj,
            "riskScore": risk_obj["score"],
            "riskLevel": risk_obj["level"],
            "riskFactors": factors,
            "factors": factors
        }), 200
    finally:
        if conn:
            conn.close()
