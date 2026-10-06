"""Tasarım kaydetme, paylaşma ve galeri uçları (hesapsız).

Kullanıcı kararları (2026-10-06): bütün tasarımlar herkese açık; tasarım şablon
olarak eklenebilir; silme ve gizleme yalnız yöneticide (galeri/yonetici.py).
Sahibi, kayıtta bir kez verilen düzenleme anahtarıyla (`X-Tasarla-Anahtar`)
tasarımını günceller; silemez.
"""
import secrets
from pathlib import Path

from django.conf import settings
from django.core.paginator import EmptyPage, Paginator
from django.db import IntegrityError, transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .dogrulama import onizleme_coz, plan_dogrula
from .models import Begeni, Sikayet, Tasarim, anahtar_ozeti, ip_ozeti
from .yonetici import yonetici_mi

SAYFA_BOYU = 24


class KayitSiniri(AnonRateThrottle):
    scope = "kayit"


class EtkilesimSiniri(AnonRateThrottle):
    scope = "etkilesim"


class SikayetSiniri(AnonRateThrottle):
    scope = "sikayet"


def _ip(request):
    return KayitSiniri().get_ident(request)


def _onizleme_adresi(t):
    if not t.onizleme:
        return ""
    return f"{settings.MEDIA_URL}{t.onizleme}?v={int(t.guncelleme.timestamp())}"


def _ozet(t):
    return {"kod": t.kod, "baslik": t.baslik, "yazar_adi": t.yazar_adi, "aciklama": t.aciklama,
            "onizleme": _onizleme_adresi(t), "begeni_sayisi": t.begeni_sayisi, "kopya_sayisi": t.kopya_sayisi,
            "goruntulenme": t.goruntulenme, "sablon": t.sablon,
            "olusturma": t.olusturma.isoformat(), "guncelleme": t.guncelleme.isoformat()}


def _onizleme_yaz(t, baytlar):
    klasor = Path(settings.MEDIA_ROOT) / "onizleme"
    klasor.mkdir(parents=True, exist_ok=True)
    (klasor / f"{t.kod}.webp").write_bytes(baytlar)
    return f"onizleme/{t.kod}.webp"


def _onizleme_sil(t):
    if t.onizleme:
        (Path(settings.MEDIA_ROOT) / t.onizleme).unlink(missing_ok=True)


class TasarimGiris(serializers.Serializer):
    baslik = serializers.CharField(max_length=80, trim_whitespace=True)
    aciklama = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    yazar_adi = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")
    plan = serializers.JSONField()
    onizleme = serializers.CharField(required=False, allow_blank=True, default="")
    sablon = serializers.BooleanField(required=False, default=False)
    kaynak = serializers.CharField(max_length=16, required=False, allow_blank=True, default="")
    # Bal küpü: insanlar görmez, botlar doldurur
    web_sitesi = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_baslik(self, deger):
        if not deger.strip():
            raise serializers.ValidationError("Başlık gerekli.")
        return deger.strip()

    def validate_plan(self, deger):
        return plan_dogrula(deger)

    def validate_onizleme(self, deger):
        return onizleme_coz(deger) if deger else b""


class Saglik(APIView):
    def get(self, request):
        return Response({"ok": True})


class TasarimOlustur(APIView):
    throttle_classes = [KayitSiniri]

    def post(self, request):
        giris = TasarimGiris(data=request.data)
        giris.is_valid(raise_exception=True)
        v = giris.validated_data
        if v["web_sitesi"]:
            return Response({"detail": "Kaydedildi."}, status=201)   # bot: sessizce yut
        kaynak = Tasarim.objects.filter(kod=v["kaynak"], gizli=False).first() if v["kaynak"] else None
        anahtar = secrets.token_urlsafe(24)
        with transaction.atomic():
            t = Tasarim.objects.create(baslik=v["baslik"], aciklama=v["aciklama"], yazar_adi=v["yazar_adi"].strip(),
                                       plan=v["plan"], sablon=v["sablon"], kaynak=kaynak,
                                       anahtar_ozeti=anahtar_ozeti(anahtar), ip_ozeti=ip_ozeti(_ip(request)))
            if v["onizleme"]:
                t.onizleme = _onizleme_yaz(t, v["onizleme"])
                t.save(update_fields=["onizleme"])
            if kaynak:
                Tasarim.objects.filter(pk=kaynak.pk).update(kopya_sayisi=F("kopya_sayisi") + 1)
        # Anahtar yalnız burada, bir kez döner; sunucuda özeti durur
        return Response({**_ozet(t), "anahtar": anahtar}, status=201)


class TasarimAyrinti(APIView):
    def get_throttles(self):
        return [KayitSiniri()] if self.request.method == "PUT" else []

    def _yazilabilir(self, request, kod):
        t = get_object_or_404(Tasarim, kod=kod)
        if not t.anahtar_dogru(request.headers.get("X-Tasarla-Anahtar", "")):
            return None, Response({"detail": "Bu tasarımı değiştirme yetkiniz yok."}, status=403)
        return t, None

    def get(self, request, kod):
        t = get_object_or_404(Tasarim, kod=kod, gizli=False)
        Tasarim.objects.filter(pk=t.pk).update(goruntulenme=F("goruntulenme") + 1)
        sahibi = t.anahtar_dogru(request.headers.get("X-Tasarla-Anahtar", ""))
        return Response({**_ozet(t), "plan": t.plan, "kaynak": t.kaynak.kod if t.kaynak and not t.kaynak.gizli else "",
                         "sahibi": sahibi})

    def put(self, request, kod):
        t, red = self._yazilabilir(request, kod)
        if red:
            return red
        giris = TasarimGiris(data=request.data)
        giris.is_valid(raise_exception=True)
        v = giris.validated_data
        t.baslik, t.aciklama, t.yazar_adi = v["baslik"], v["aciklama"], v["yazar_adi"].strip()
        t.plan, t.sablon = v["plan"], v["sablon"]
        if v["onizleme"]:
            t.onizleme = _onizleme_yaz(t, v["onizleme"])
        t.save()
        return Response(_ozet(t))

    def delete(self, request, kod):
        if not yonetici_mi(request):
            return Response({"detail": "Tasarımları yalnız yönetici silebilir."}, status=403)
        t = get_object_or_404(Tasarim, kod=kod)
        _onizleme_sil(t)
        t.delete()
        return Response(status=204)


class Galeri(APIView):
    def get(self, request):
        sira = request.query_params.get("sira", "yeni")
        tur = request.query_params.get("tur")
        inceleme = tur == "inceleme"
        if inceleme:
            # Yönetici: şikâyet alanlar (listeden düşenler dahil), gizlenenler hariç
            if not yonetici_mi(request):
                return Response({"detail": "Yetki yok."}, status=403)
            qs = Tasarim.objects.filter(gizli=False, sikayet_sayisi__gt=0)
        else:
            qs = Tasarim.objects.filter(galeride=True, gizli=False)
            if tur == "sablon":
                qs = qs.filter(sablon=True)
        if inceleme:
            qs = qs.order_by("-sikayet_sayisi", "-olusturma")
        else:
            qs = qs.order_by("-begeni_sayisi", "-olusturma") if sira == "begeni" else qs.order_by("-olusturma")
        try:
            sayfa = Paginator(qs, SAYFA_BOYU).page(max(1, int(request.query_params.get("sayfa", "1"))))
        except (EmptyPage, ValueError):
            return Response({"sonuclar": [], "sonraki": None, "toplam": qs.count()})
        ozet = (lambda t: {**_ozet(t), "sikayet_sayisi": t.sikayet_sayisi, "galeride": t.galeride}) if inceleme else _ozet
        return Response({"sonuclar": [ozet(t) for t in sayfa],
                         "sonraki": sayfa.next_page_number() if sayfa.has_next() else None,
                         "toplam": sayfa.paginator.count})


class Begen(APIView):
    throttle_classes = [EtkilesimSiniri]

    def post(self, request, kod):
        t = get_object_or_404(Tasarim, kod=kod, gizli=False)
        try:
            with transaction.atomic():
                Begeni.objects.create(tasarim=t, ip_ozeti=ip_ozeti(_ip(request)))
                Tasarim.objects.filter(pk=t.pk).update(begeni_sayisi=F("begeni_sayisi") + 1)
        except IntegrityError:
            pass   # aynı ziyaretçi ikinci kez beğenemez
        t.refresh_from_db(fields=["begeni_sayisi"])
        return Response({"begeni_sayisi": t.begeni_sayisi})


class SikayetEt(APIView):
    throttle_classes = [SikayetSiniri]

    def post(self, request, kod):
        t = get_object_or_404(Tasarim, kod=kod, gizli=False)
        neden = str(request.data.get("neden", ""))[:200]
        try:
            with transaction.atomic():
                Sikayet.objects.create(tasarim=t, ip_ozeti=ip_ozeti(_ip(request)), neden=neden)
                Tasarim.objects.filter(pk=t.pk).update(sikayet_sayisi=F("sikayet_sayisi") + 1)
        except IntegrityError:
            pass
        t.refresh_from_db(fields=["sikayet_sayisi"])
        if t.sikayet_sayisi >= settings.SIKAYET_ESIGI and t.galeride:
            # Eşiği aşan tasarım galeriden düşer (bağlantısı çalışır); karar moderasyonda
            Tasarim.objects.filter(pk=t.pk).update(galeride=False)
        return Response({"detail": "Bildiriminiz alındı. Teşekkürler."}, status=201)


class Yonetici(APIView):
    """GET → {yonetici: bool}: arayüz Sil / Gizle düğmelerini buna göre gösterir."""

    def get(self, request):
        return Response({"yonetici": yonetici_mi(request)})


class Moderasyon(APIView):
    """POST {gizli?: bool, galeride?: bool} — yalnız yönetici (Pusula rolü ya da moderasyon anahtarı)."""

    def post(self, request, kod):
        if not yonetici_mi(request):
            return Response({"detail": "Yetki yok."}, status=403)
        t = get_object_or_404(Tasarim, kod=kod)
        alanlar = []
        for alan in ("gizli", "galeride"):
            if alan in request.data:
                setattr(t, alan, bool(request.data[alan]))
                alanlar.append(alan)
        if alanlar:
            t.save(update_fields=alanlar)
        return Response({**_ozet(t), "gizli": t.gizli, "sikayet_sayisi": t.sikayet_sayisi})
