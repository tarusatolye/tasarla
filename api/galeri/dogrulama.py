"""Plan ve önizleme doğrulaması.

Paylaşılan plan başka ziyaretçilerin tarayıcısında açılır: SVG özniteliğine
yazılan her alan (renk, tür, kimlik) dar bir kalıba uymak zorunda, serbest
metinler yalnız uzunlukla sınırlı (arayüz bunları kaçışlayarak yazar).
"""
import base64
import binascii
import io
import json
import math
import re

from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

PLAN_EN_FAZLA_BAYT = 256 * 1024
ONIZLEME_EN_FAZLA_BAYT = 2 * 1024 * 1024
ONIZLEME_EN_FAZLA_PIKSEL = 1600          # uzun kenar; daha büyüğü küçültülür

_KIMLIK = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
_RENK = re.compile(r"^#[0-9A-Fa-f]{6}$")
_DUVAR = re.compile(r"^w\d{1,4}$")


def _hata(mesaj):
    raise serializers.ValidationError(mesaj)


def _sayi(deger, alan, en_kucuk=-1e6, en_buyuk=1e6):
    if isinstance(deger, bool) or not isinstance(deger, (int, float)) or not math.isfinite(deger):
        _hata(f"{alan} sayı olmalı.")
    if not en_kucuk <= deger <= en_buyuk:
        _hata(f"{alan} aralık dışında.")
    return deger


def _metin(deger, alan, uzunluk):
    if not isinstance(deger, str) or len(deger) > uzunluk:
        _hata(f"{alan} en çok {uzunluk} karakterlik metin olmalı.")
    return deger


def _kalip(deger, kalip, alan):
    if not isinstance(deger, str) or not kalip.match(deger):
        _hata(f"{alan} geçersiz.")
    return deger


def plan_dogrula(plan):
    if not isinstance(plan, dict):
        _hata("Plan nesne olmalı.")
    if len(json.dumps(plan, ensure_ascii=False).encode()) > PLAN_EN_FAZLA_BAYT:
        _hata("Plan çok büyük.")

    mobilya = plan.get("furniture")
    if not isinstance(mobilya, list) or len(mobilya) > 600:
        _hata("Mobilya listesi geçersiz.")
    temiz_mobilya = []
    for i, f in enumerate(mobilya):
        if not isinstance(f, dict):
            _hata(f"Mobilya {i + 1} geçersiz.")
        temiz_mobilya.append({
            "id": _kalip(f.get("id"), _KIMLIK, "Mobilya kimliği"),
            "type": _kalip(f.get("type"), _KIMLIK, "Mobilya türü"),
            "name": _metin(f.get("name", ""), "Mobilya adı", 80),
            "cx": _sayi(f.get("cx"), "Konum"), "cy": _sayi(f.get("cy"), "Konum"),
            "w": _sayi(f.get("w"), "Genişlik", 1, 50000), "d": _sayi(f.get("d"), "Derinlik", 1, 50000),
            "rot": _sayi(f.get("rot", 0), "Dönüş", -360, 360),
            "color": _kalip(f.get("color"), _RENK, "Renk"),
        })

    odalar = plan.get("rooms", {})
    if not isinstance(odalar, dict) or len(odalar) > 100:
        _hata("Mahal listesi geçersiz.")
    temiz_odalar = {}
    for k, r in odalar.items():
        _kalip(k, _KIMLIK, "Mahal kimliği")
        if not isinstance(r, dict):
            _hata("Mahal geçersiz.")
        temiz_odalar[k] = {"name": _metin(r.get("name", ""), "Mahal adı", 60),
                           "mat": _kalip(r.get("mat"), _KIMLIK, "Döşeme malzemesi")}

    yikilan = plan.get("demolished", [])
    if not isinstance(yikilan, list) or len(yikilan) > 300:
        _hata("Yıkılan duvar listesi geçersiz.")
    yikilan = [_kalip(w, _DUVAR, "Duvar kimliği") for w in yikilan]

    olculer = plan.get("measures", [])
    if not isinstance(olculer, list) or len(olculer) > 300:
        _hata("Ölçü listesi geçersiz.")
    temiz_olculer = []
    for m in olculer:
        if not isinstance(m, dict) or not isinstance(m.get("a"), dict) or not isinstance(m.get("b"), dict):
            _hata("Ölçü geçersiz.")
        temiz_olculer.append({u: {"x": _sayi(m[u].get("x"), "Ölçü"), "y": _sayi(m[u].get("y"), "Ölçü")} for u in ("a", "b")})

    # Yalnız bilinen alanlar saklanır; fazlası atılır
    return {"furniture": temiz_mobilya, "rooms": temiz_odalar, "demolished": yikilan, "measures": temiz_olculer}


def onizleme_coz(veri_adresi):
    """data:image/png;base64,… → yeniden kodlanmış PNG baytları.

    Görsel Pillow'la açılıp sıfırdan PNG olarak yazılır: gömülü meta veri ve
    görsel kılığındaki başka içerik sunucuya düşmez."""
    if not isinstance(veri_adresi, str) or not veri_adresi.startswith(("data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,")):
        _hata("Önizleme PNG, JPEG ya da WebP veri adresi olmalı.")
    try:
        ham = base64.b64decode(veri_adresi.split(",", 1)[1], validate=True)
    except (binascii.Error, ValueError):
        _hata("Önizleme çözülemedi.")
    if len(ham) > ONIZLEME_EN_FAZLA_BAYT:
        _hata("Önizleme çok büyük.")
    try:
        with Image.open(io.BytesIO(ham)) as g:
            if g.width * g.height > 40_000_000:
                _hata("Önizleme çok büyük.")
            g = g.convert("RGB")
            g.thumbnail((ONIZLEME_EN_FAZLA_PIKSEL, ONIZLEME_EN_FAZLA_PIKSEL))
            cikti = io.BytesIO()
            g.save(cikti, "WEBP", quality=82)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        _hata("Önizleme görsel değil.")
    return cikti.getvalue()
