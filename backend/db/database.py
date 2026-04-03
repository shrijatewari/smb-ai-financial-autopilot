"""
Legacy module name kept for imports that expect `db.database`.

Database access is via Prisma (`db.prisma_client.prisma`) and PostgreSQL (`DATABASE_URL`).
"""

from __future__ import annotations

import os

# Exposed for health checks or scripts that only need the connection string.
DATABASE_URL = os.environ.get("DATABASE_URL", "")
