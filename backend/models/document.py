try:
    from backend.services.database import get_db_connection
except ImportError:
    from services.database import get_db_connection

class DocumentModel:
    @staticmethod
    def get_all(user_id=None):
        """
        Fetches documents from PostgreSQL including analysis states.
        Strictly scoped by user_id if provided.
        """
        conn = None
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            if user_id:
                cur.execute("""
                    SELECT 
                        d.id, 
                        COALESCE(d.original_name, d.filename) AS filename, 
                        COALESCE(d.risk_score, 5) AS risk_score,
                        d.size,
                        d.sha256,
                        COALESCE(d.analysis_status, 'NOT_STARTED') AS analysis_status,
                        d.analysis_error,
                        d.created_at,
                        (COUNT(c.id) > 0) AS has_previous_analysis
                    FROM documents d
                    LEFT JOIN document_clauses c ON d.id = c.document_id
                    WHERE d.user_id = %s
                    GROUP BY d.id, d.original_name, d.filename, d.risk_score, d.size, d.sha256, d.analysis_status, d.analysis_error, d.created_at
                    ORDER BY d.created_at DESC;
                """, (user_id,))
            else:
                cur.execute("""
                    SELECT 
                        d.id, 
                        COALESCE(d.original_name, d.filename) AS filename, 
                        COALESCE(d.risk_score, 5) AS risk_score,
                        d.size,
                        d.sha256,
                        COALESCE(d.analysis_status, 'NOT_STARTED') AS analysis_status,
                        d.analysis_error,
                        d.created_at,
                        (COUNT(c.id) > 0) AS has_previous_analysis
                    FROM documents d
                    LEFT JOIN document_clauses c ON d.id = c.document_id
                    GROUP BY d.id, d.original_name, d.filename, d.risk_score, d.size, d.sha256, d.analysis_status, d.analysis_error, d.created_at
                    ORDER BY d.created_at DESC;
                """)
            rows = cur.fetchall()
            cur.close()
            
            if rows:
                return [
                    {
                        "id": row["id"],
                        "filename": row["filename"],
                        "risk_score": row["risk_score"],
                        "analysis_status": row["analysis_status"],
                        "analysisStatus": row["analysis_status"],
                        "has_previous_analysis": bool(row["has_previous_analysis"]),
                        "hasPreviousAnalysis": bool(row["has_previous_analysis"]),
                        "analysis_error": row["analysis_error"],
                        "size": row["size"],
                        "sha256": row["sha256"],
                        "created_at": str(row["created_at"])
                    }
                    for row in rows
                ]
            
            return [
                {
                    "id": 1,
                    "filename": "Sample_Residential_Purchase_Agreement.pdf",
                    "risk_score": 5,
                    "analysis_status": "COMPLETED",
                    "analysisStatus": "COMPLETED"
                }
            ]
        except Exception as e:
            print(f"[DocumentModel Error] {e}")
            return [
                {
                    "id": 1,
                    "filename": "Sample_Residential_Purchase_Agreement.pdf",
                    "risk_score": 5,
                    "analysis_status": "COMPLETED",
                    "analysisStatus": "COMPLETED"
                }
            ]
        finally:
            if conn:
                conn.close()

    @staticmethod
    def create_document(
        doc_id, user_id, filename, original_name, mime_type, size, sha256,
        extracted_text="", storage_path="", extraction_status="COMPLETED",
        extraction_method="PYMUPDF", ocr_confidence=None, page_count=1,
        character_count=0, risk_score=5, analysis_status="NOT_STARTED"
    ):
        """
        Inserts a new document record with full architectural metadata into PostgreSQL.
        """
        conn = None
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO documents (
                    id, user_id, filename, original_name, mime_type, 
                    size, sha256, encrypted, extracted_text, ocr_confidence, 
                    version_group, version_number, risk_score,
                    storage_path, extraction_status, extraction_method,
                    page_count, character_count, analysis_status, processed_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, true, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (id) DO UPDATE SET
                    extracted_text = CASE
                        WHEN documents.extracted_text IS NOT NULL AND length(documents.extracted_text) > 0 THEN documents.extracted_text
                        ELSE EXCLUDED.extracted_text
                    END,
                    extraction_status = CASE
                        WHEN documents.extraction_status = 'COMPLETED' THEN 'COMPLETED'
                        WHEN EXCLUDED.extraction_status = 'COMPLETED' THEN 'COMPLETED'
                        ELSE documents.extraction_status
                    END,
                    analysis_status = CASE
                        WHEN documents.analysis_status = 'COMPLETED' THEN 'COMPLETED'
                        WHEN EXCLUDED.analysis_status = 'COMPLETED' THEN 'COMPLETED'
                        ELSE documents.analysis_status
                    END,
                    ocr_confidence = COALESCE(documents.ocr_confidence, EXCLUDED.ocr_confidence),
                    risk_score = COALESCE(documents.risk_score, EXCLUDED.risk_score)
                RETURNING id, original_name, filename, size, sha256, extraction_status, extraction_method, ocr_confidence, page_count, character_count, risk_score, analysis_status, created_at;
            """, (
                doc_id, user_id, filename, original_name, mime_type,
                size, sha256, extracted_text, ocr_confidence,
                doc_id, 1, risk_score,
                storage_path, extraction_status, extraction_method,
                page_count, character_count, analysis_status
            ))
            row = cur.fetchone()
            conn.commit()
            cur.close()
            return dict(row)
        except Exception as e:
            if conn:
                conn.rollback()
            print(f"[DocumentModel Create Error] {e}")
            raise e
        finally:
            if conn:
                conn.close()

    @staticmethod
    def get_by_id(doc_id):
        conn = None
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT * FROM documents WHERE id = %s;", (doc_id,))
            row = cur.fetchone()
            cur.close()
            return dict(row) if row else None
        finally:
            if conn:
                conn.close()
