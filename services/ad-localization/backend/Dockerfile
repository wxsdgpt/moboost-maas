# Moboost MAAS — Ad-Localization Backend
# Multi-stage build: slim production image with dev-mode override

FROM python:3.12-slim AS base

# System deps for psycopg (PostgreSQL), Pillow (image processing)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc g++ \
    libffi-dev \
    libjpeg62-turbo-dev libpng-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e ".[dev]" 2>/dev/null || pip install --no-cache-dir -e "."

# Copy application code
COPY . .

# Create storage directory
RUN mkdir -p /app/storage

EXPOSE 8000

# Default: dev mode with hot-reload
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
