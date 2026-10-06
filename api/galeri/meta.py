"""Paylaşılan tasarım bağlantısı için önizleme kartı (Open Graph) meta etiketleri.

Site statik: index.html'i nginx verir. `/?t=<kod>` isteğinde nginx SSI, index.html'in
<head>'inde bu ucu alt istekle çağırır (deploy/nginx.conf → /_paylasim-meta) ve dönen
<meta> satırlarını yerine yazar; `t` yoksa index.html'deki varsayılan etiketler kalır.
Tasarım yoksa ya da gizliyse varsayılan etiketler döner (gizli tasarımın adı sızmaz).

Görsel adresi mutlak ve https (TASARLA_SITE_URL); /api/medya/ girişsiz açıktır.
"""
import re
from pathlib import Path

from django.conf import settings
from django.http import HttpResponse
from django.utils.html import escape
from django.views.decorators.http import require_GET
from PIL import Image

from .models import Tasarim

_KOD = re.compile(r"^[a-z0-9]{1,16}$")
SITE_ADI = "tarus Tasarla"
VARSAYILAN_ACIKLAMA = ("tarus Tasarla: ücretsiz, giriş gerektirmeyen 2B plan ve 3B mekân tasarımı. "
                       "Türkiye ölçüleriyle tefriş, mahal alanları ve döşeme maliyeti.")


def _kisalt(metin, uzunluk):
    metin = " ".join(str(metin).split())
    return metin if len(metin) <= uzunluk else metin[:uzunluk - 1].rstrip() + "…"


def _gorsel_olcusu(goreli):
    try:
        with Image.open(Path(settings.MEDIA_ROOT) / goreli) as g:   # yalnız başlık okunur
            return g.size
    except (OSError, ValueError):
        return None


def meta_etiketleri(t=None):
    """[(özellik, değer), …]: t None ise sitenin varsayılan kartı."""
    site = settings.SITE_URL
    if t is None:
        return [("og:type", "website"), ("og:site_name", SITE_ADI), ("og:locale", "tr_TR"),
                ("og:title", SITE_ADI), ("og:description", VARSAYILAN_ACIKLAMA), ("og:url", f"{site}/"),
                ("og:image", f"{site}/public/icon-512.png"), ("og:image:width", "512"), ("og:image:height", "512"),
                ("og:image:alt", SITE_ADI), ("twitter:card", "summary")]
    aciklama = t.aciklama.strip() or (
        f"{t.yazar_adi.strip() or 'Bir kullanıcı'} tarafından tarus Tasarla'da paylaşılan "
        f"{'şablon' if t.sablon else 'konut planı'}: 2B tefriş ve 3B mekân.")
    etiketler = [e.ad for e in t.etiketler.all()]
    if etiketler:
        aciklama = f"{_kisalt(aciklama, 160)} · {', '.join(etiketler)}"
    satirlar = [("og:type", "website"), ("og:site_name", SITE_ADI), ("og:locale", "tr_TR"),
                ("og:title", f"{_kisalt(t.baslik, 80)} · {SITE_ADI}"), ("og:description", _kisalt(aciklama, 200)),
                ("og:url", f"{site}/?t={t.kod}")]
    if t.onizleme:
        satirlar += [("og:image", f"{site}{settings.MEDIA_URL}{t.onizleme}?v={int(t.guncelleme.timestamp())}"),
                     ("og:image:type", "image/webp")]
        olcu = _gorsel_olcusu(t.onizleme)
        if olcu:
            satirlar += [("og:image:width", str(olcu[0])), ("og:image:height", str(olcu[1]))]
        satirlar += [("og:image:alt", _kisalt(t.baslik, 80)), ("twitter:card", "summary_large_image")]
    else:
        satirlar += [("og:image", f"{site}/public/icon-512.png"), ("twitter:card", "summary")]
    return satirlar


def meta_html(satirlar):
    # twitter:* «name», og:* «property» özniteliğiyle; değerler HTML kaçışlı
    return "".join(
        f'<meta {"name" if ozellik.startswith("twitter:") else "property"}="{ozellik}" content="{escape(deger)}">\n'
        for ozellik, deger in satirlar)


@require_GET
def paylasim_meta(request):
    kod = request.GET.get("t", "").strip()
    t = Tasarim.objects.filter(kod=kod, gizli=False).prefetch_related("etiketler").first() if _KOD.match(kod) else None
    yanit = HttpResponse(meta_html(meta_etiketleri(t)), content_type="text/html; charset=utf-8")
    yanit["Cache-Control"] = "no-store"
    yanit["X-Robots-Tag"] = "noindex"
    return yanit
