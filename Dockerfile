FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py extraction.py ./
COPY templates ./templates
COPY static ./static
RUN useradd --create-home appuser
USER appuser
EXPOSE 8086
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8086/health', timeout=4)"
CMD ["gunicorn", "--bind", "0.0.0.0:8086", "--workers", "2", "--threads", "2", "--timeout", "300", "app:app"]
