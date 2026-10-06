"""Yönetici doğrulaması (silme ve gizleme yalnız yöneticide — kullanıcı kararı 2026-10-06).

İki yol:
  1. Pusula oturumu: arayüz «Pusula ile bağlan» sonrası Pusula erişim belirtecini
     `Authorization: Bearer` ile gönderir; burada Pusula'nın /auth/me/ ucuna sorulur,
     rol TASARLA_YONETICI_ROLLERI içindeyse (varsayılan SUPERADMIN) yöneticidir.
     Yanıt belirtecin özetiyle kısa süre önbelleğe alınır.
  2. TASARLA_MODERASYON_TOKEN: sunucu / curl ile moderasyon için sabit anahtar.
"""
import hashlib
import hmac
import json
import logging
import urllib.error
import urllib.request

from django.conf import settings
from django.core.cache import cache

log = logging.getLogger(__name__)


def _pusula_rolu(belirtec):
    anahtar = "tasarla-yonetici:" + hashlib.sha256(belirtec.encode()).hexdigest()
    rol = cache.get(anahtar)
    if rol is not None:
        return rol
    istek = urllib.request.Request(f"{settings.PUSULA_URL}/auth/me/", headers={
        "Authorization": f"Bearer {belirtec}", "Accept": "application/json", "User-Agent": "tasarla-api"})
    try:
        with urllib.request.urlopen(istek, timeout=5) as y:
            rol = str(json.load(y).get("role", ""))
    except urllib.error.HTTPError as e:
        if e.code not in (401, 403):
            log.warning("Pusula /auth/me/ %s döndü", e.code)
            return ""                                  # geçici hata önbelleğe yazılmaz
        rol = ""
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        log.warning("Pusula /auth/me/ ulaşılamadı: %s", e)
        return ""
    cache.set(anahtar, rol, settings.YONETICI_ONBELLEK_SN)
    return rol


def yonetici_mi(request):
    belirtec = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not belirtec:
        return False
    if settings.MODERASYON_TOKEN and hmac.compare_digest(belirtec, settings.MODERASYON_TOKEN):
        return True
    if belirtec.count(".") != 2:                       # JWT değilse Pusula'ya sormaya gerek yok
        return False
    return _pusula_rolu(belirtec) in settings.YONETICI_ROLLERI
