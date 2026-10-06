FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -u 1000 -m uygulama && mkdir -p /app/medya /app/veri && chown -R uygulama /app/medya /app/veri
# DATABASE_URL verilmezse SQLite bu kalıcı birimde tutulur (docker-compose.yml → veri).
ENV SQLITE_YOLU=/app/veri/tasarla.sqlite3 MEDIA_ROOT=/app/medya
USER uygulama
EXPOSE 8000
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn tasarla_api.wsgi -b 0.0.0.0:8000 -w ${GUNICORN_WORKERS:-2} --access-logfile -"]
