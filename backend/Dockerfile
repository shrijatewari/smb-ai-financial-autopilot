# FastAPI + Prisma (python). Deploy from backend/: fly deploy
FROM python:3.12-slim-bookworm

# libatomic1: Prisma (python) bundles Node for CLI; Node needs libatomic.so.1 on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-eng \
    libatomic1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN prisma generate --schema prisma/schema.prisma

ENV PYTHONUNBUFFERED=1
ENV PORT=8080
EXPOSE 8080
# Fly may set PORT; keep default 8080 to match fly.toml internal_port.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
