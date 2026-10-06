"""tasarla.tarus.tr — tasarım kaydetme, paylaşma ve galeri API'si.

Hesap yok (kullanıcı kararı 2026-10-06): tasarım kaydedilince bir düzenleme
anahtarı üretilir, yalnız tarayıcıya verilir; sunucuda özeti (sha256) durur.
Arayüz aynı alan adından /api/ altında çağırır (nginx vekil), CORS gerekmez.
"""
import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def _liste(ad, varsayilan=""):
    return [x.strip() for x in os.environ.get(ad, varsayilan).split(",") if x.strip()]


DEBUG = os.environ.get("DJANGO_DEBUG", "") == "1"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if not DEBUG:
        raise RuntimeError("DJANGO_SECRET_KEY tanımlı değil (Coolify → Environment Variables).")
    SECRET_KEY = "yerel-gelistirme-anahtari"

ALLOWED_HOSTS = _liste("DJANGO_ALLOWED_HOSTS", "tasarla.tarus.tr,localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "rest_framework",
    "galeri",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
# Çerez ve oturum yok; yazma yetkisi düzenleme anahtarı başlığıyla gelir, CSRF gerekmez.
SILENCED_SYSTEM_CHECKS = ["security.W003"]

# TLS Coolify/Traefik'te sonlanır; http → https yönlendirmesini Cloudflare yapar.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

ROOT_URLCONF = "tasarla_api.urls"
WSGI_APPLICATION = "tasarla_api.wsgi.application"

# DATABASE_URL boş gelebilir (compose'ta tanımsız değişken boş metin olur); o zaman
# SQLite. Konteynerde SQLITE_YOLU kalıcı birimdedir (Dockerfile).
_vt_adresi = os.environ.get("DATABASE_URL", "").strip() or \
    f"sqlite:///{os.environ.get('SQLITE_YOLU', '').strip() or BASE_DIR / 'yerel.sqlite3'}"
DATABASES = {"default": dj_database_url.parse(_vt_adresi, conn_max_age=60)}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LANGUAGE_CODE = "tr"
TIME_ZONE = "Europe/Istanbul"
USE_I18N = True
USE_TZ = True

# Önizleme görselleri: kalıcı birimde, nginx /api/medya/ altından doğrudan verir.
MEDIA_ROOT = os.environ.get("MEDIA_ROOT", str(BASE_DIR / "medya"))
MEDIA_URL = "/api/medya/"
# Gövde: plan JSON'u (≤ 256 KB) + base64 önizleme (≤ 2 MB)
DATA_UPLOAD_MAX_MEMORY_SIZE = 3 * 1024 * 1024

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
if os.environ.get("REDIS_URL"):
    CACHES["default"] = {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": os.environ["REDIS_URL"]}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "UNAUTHENTICATED_USER": None,
    # nginx ziyaretçi IP'sini X-Forwarded-For olarak verir (deploy/nginx-compose.conf).
    "NUM_PROXIES": int(os.environ.get("DJANGO_NUM_PROXIES", "1")),
    "DEFAULT_THROTTLE_RATES": {
        "kayit": os.environ.get("TASARLA_KAYIT_SINIRI", "30/hour"),
        "etkilesim": "120/hour",
        "sikayet": "10/hour",
    },
}

# Galeri kuralları
SIKAYET_ESIGI = int(os.environ.get("TASARLA_SIKAYET_ESIGI", "3"))   # bu kadar şikâyette galeriden düşer
# Silme ve gizleme yalnız yöneticide (galeri/yonetici.py): Pusula oturumundaki rol bu listedeyse
# ya da Authorization: Bearer TASARLA_MODERASYON_TOKEN (boşsa bu yol kapalı).
MODERASYON_TOKEN = os.environ.get("TASARLA_MODERASYON_TOKEN", "")
PUSULA_URL = os.environ.get("PUSULA_URL", "https://pusula.tarus.tr").rstrip("/")
YONETICI_ROLLERI = _liste("TASARLA_YONETICI_ROLLERI", "SUPERADMIN")
YONETICI_ONBELLEK_SN = int(os.environ.get("TASARLA_YONETICI_ONBELLEK_SN", "120"))

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"konsol": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["konsol"], "level": os.environ.get("LOG_LEVEL", "INFO")},
}
