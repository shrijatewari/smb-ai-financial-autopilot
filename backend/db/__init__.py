from db.prisma_client import connect_prisma, disconnect_prisma, prisma

# Re-export Prisma User model for type hints (same role as former SQLAlchemy User).
from prisma.models import User

__all__ = ["prisma", "connect_prisma", "disconnect_prisma", "User"]
