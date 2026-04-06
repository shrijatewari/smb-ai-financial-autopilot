"""
Compatibility entrypoint – delegates to `main.app`.

Preferred: uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

from main import app

__all__ = ["app"]
