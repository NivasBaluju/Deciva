import os
import sys

# Ensure both project root and backend directory are on Python path
PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))
BACKEND_DIR = os.path.join(PROJECT_ROOT, 'backend')

for p in [BACKEND_DIR, PROJECT_ROOT]:
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.app import app

if __name__ == '__main__':
    port = int(os.environ.get('FLASK_PORT', 5001 if os.environ.get('PORT') == '5000' else os.environ.get('PORT', 5001)))
    app.run(host='0.0.0.0', port=port)
