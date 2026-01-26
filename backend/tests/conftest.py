from __future__ import annotations

import sys
from pathlib import Path

# Ensure `import app.*` works when running tests from `backend/`.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
