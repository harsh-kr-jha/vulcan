FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

WORKDIR /app

RUN pip install --no-cache-dir uv==0.11.7
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

RUN addgroup --system app && adduser --system --ingroup app app

COPY --chown=app:app backend ./backend
COPY --chown=app:app processing ./processing

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app/backend:/app"

USER app

EXPOSE 8000
CMD ["gunicorn", "--chdir", "backend", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60", "config.wsgi:application"]
