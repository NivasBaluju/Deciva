import os
import sys

# Ensure both backend directory and project root are on Python path
BACKEND_DIR = os.path.abspath(os.path.dirname(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BACKEND_DIR, '..'))

for p in [BACKEND_DIR, PROJECT_ROOT]:
    if p not in sys.path:
        sys.path.insert(0, p)

import hmac
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

try:
    from backend.routes.documents import documents_bp
    from backend.routes.chat_routes import chat_bp
    from backend.routes.negotiation_routes import negotiation_bp
    from backend.routes.simulation_routes import simulation_bp
    from backend.routes.intelligence_routes import intelligence_bp
    from backend.services.database import test_connection
except ImportError:
    from routes.documents import documents_bp
    from routes.chat_routes import chat_bp
    from routes.negotiation_routes import negotiation_bp
    from routes.simulation_routes import simulation_bp
    from routes.intelligence_routes import intelligence_bp
    from services.database import test_connection

load_dotenv()

def create_app():
    app = Flask(__name__)
    allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://127.0.0.1:5000,http://localhost:5000,http://127.0.0.1:3000,http://localhost:3000").split(",") if o.strip()]
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

    # Internal Microservice Boundary Verification
    env = os.getenv("FLASK_ENV", os.getenv("NODE_ENV", "development")).lower()
    raw_internal_key = os.getenv("INTERNAL_SERVICE_KEY")
    if not raw_internal_key:
        if env == "production":
            raise RuntimeError("CRITICAL SECURITY VIOLATION: INTERNAL_SERVICE_KEY environment variable must be set in production.")
        internal_key = "deciva-internal-service-secret-key-default"
    else:
        internal_key = raw_internal_key

    # In production, internal service key requirement cannot be disabled
    import uuid
    from flask import g

    if env == "production":
        require_internal_key = True
    else:
        require_internal_key = os.getenv("REQUIRE_INTERNAL_KEY", "true").lower() == "true"

    @app.before_request
    def handle_request_preliminaries():
        incoming_cid = request.headers.get('x-correlation-id') or request.headers.get('x-request-id')
        g.correlation_id = incoming_cid if incoming_cid else str(uuid.uuid4())

        if request.path in ['/api/health', '/api/health/live', '/api/health/ready', '/']:
            return None

        if require_internal_key:
            caller_key = request.headers.get('x-internal-service-key', '')
            if not caller_key or not hmac.compare_digest(caller_key.encode('utf-8'), internal_key.encode('utf-8')):
                return jsonify({
                    "error": "Forbidden: Internal service authentication required",
                    "code": "INTERNAL_AUTH_REQUIRED"
                }), 403
        return None

    @app.after_request
    def attach_correlation_header(response):
        if hasattr(g, 'correlation_id'):
            response.headers['X-Correlation-Id'] = g.correlation_id
        return response

    # Register routes
    app.register_blueprint(documents_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(negotiation_bp)
    app.register_blueprint(simulation_bp)
    app.register_blueprint(intelligence_bp)

    @app.route('/api/health/live', methods=['GET'])
    def health_live():
        return jsonify({
            "status": "live",
            "service": "Deciva Flask Backend",
            "correlationId": getattr(g, 'correlation_id', None)
        }), 200

    @app.route('/api/health', methods=['GET'])
    @app.route('/api/health/ready', methods=['GET'])
    def health_check():
        db_ok, db_msg = test_connection()
        return jsonify({
            "status": "online" if db_ok else "degraded",
            "service": "Deciva Flask Backend",
            "correlationId": getattr(g, 'correlation_id', None),
            "postgres": {
                "connected": db_ok,
                "message": db_msg
            }
        }), (200 if db_ok else 500)

    @app.route('/', methods=['GET'])
    def index():
        return jsonify({
            "message": "Deciva Flask Backend API",
            "endpoints": [
                "/api/health",
                "/api/documents"
            ]
        })

    return app

# Application instance for WSGI / Gunicorn servers
app = create_app()

if __name__ == '__main__':
    port = int(os.getenv("FLASK_PORT", 5001))
    print(f">> Deciva Flask Server starting on http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)

