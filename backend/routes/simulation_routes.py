import os
from flask import Blueprint, request, jsonify

try:
    from backend.services.simulation_service import simulate_contract_scenario
    from backend.services.database import get_db_connection
except ImportError:
    from services.simulation_service import simulate_contract_scenario
    from services.database import get_db_connection

simulation_bp = Blueprint('simulation', __name__, url_prefix='/api/documents')

@simulation_bp.route('/<doc_id>/simulate', methods=['POST'])
def simulate_scenario(doc_id):
    """
    POST /api/documents/<doc_id>/simulate
    Executes Contract Risk Simulation & What-If Scenario Analysis.
    """
    data = request.get_json(silent=True) or {}
    scenario = (data.get("scenario") or "").strip()
    clause_id = data.get("clause_id") or data.get("clauseId")
    original_clause = data.get("original_clause") or data.get("originalClause")
    proposed_clause = data.get("proposed_clause") or data.get("proposedClause")
    idempotency_key = data.get("idempotency_key") or data.get("idempotencyKey")

    if not scenario and not proposed_clause:
        return jsonify({"error": "Either scenario text or proposedClause is required for risk simulation"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM documents WHERE id = %s;", (doc_id,))
        doc = cur.fetchone()
        if not doc:
            return jsonify({"error": "Document not found"}), 404
    finally:
        cur.close()
        conn.close()

    result = simulate_contract_scenario(
        document_id=doc_id,
        scenario=scenario,
        clause_id=clause_id,
        original_clause=original_clause,
        proposed_clause=proposed_clause,
        idempotency_key=idempotency_key
    )
    if result.get("error"):
        return jsonify(result), result.get("status", 400)

    return jsonify(result), 200
