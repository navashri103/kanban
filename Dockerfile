FROM node:22-slim AS frontend-builder

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY backend/pyproject.toml ./
RUN uv sync

COPY backend/app ./app
COPY backend/tests ./tests
COPY --from=frontend-builder /frontend/out ./static

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
