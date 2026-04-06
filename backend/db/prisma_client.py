"""Async Prisma client singleton – PostgreSQL via Prisma ORM."""

from __future__ import annotations

from prisma import Prisma

prisma = Prisma()


async def connect_prisma() -> None:
    await prisma.connect()


async def disconnect_prisma() -> None:
    await prisma.disconnect()
