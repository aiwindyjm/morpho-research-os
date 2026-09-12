import sys
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parents[1]
SRC = WORKER_ROOT / "src"
for entry in (WORKER_ROOT, SRC):
    if str(entry) not in sys.path:
        sys.path.insert(0, str(entry))
