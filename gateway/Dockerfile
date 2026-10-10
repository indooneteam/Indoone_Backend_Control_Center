FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    GATEWAY_DB_PATH=/data/gateway.sqlite3

WORKDIR /app
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt \
    && useradd --system --uid 10001 gateway \
    && mkdir -p /data \
    && chown -R gateway:gateway /app /data

COPY main.py /app/main.py
USER gateway
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health/live', timeout=2).read()"
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
