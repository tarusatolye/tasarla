import hashlib
import hmac
import secrets

from django.conf import settings
from django.db import models

_ALFABE = "23456789abcdefghjkmnpqrstuvwxyz"   # karışan karakterler (0/o, 1/l/i) yok


def yeni_kod():
    return "".join(secrets.choice(_ALFABE) for _ in range(10))


def anahtar_ozeti(anahtar: str) -> str:
    return hashlib.sha256(anahtar.encode()).hexdigest()


def ip_ozeti(ip: str) -> str:
    """IP saklanmaz; yalnız sınır ve tekil beğeni için anahtarlı özet (KVKK)."""
    return hmac.new(settings.SECRET_KEY.encode(), ip.encode(), hashlib.sha256).hexdigest()


class Etiket(models.Model):
    """Galeri etiketi. Ad küçük harfle (Türkçe kurala göre) saklanır: dogrulama.etiketleri_temizle."""
    ad = models.CharField(max_length=24, unique=True)

    class Meta:
        ordering = ["ad"]

    def __str__(self):
        return self.ad


class Tasarim(models.Model):
    kod = models.CharField(max_length=16, unique=True, default=yeni_kod, editable=False)
    baslik = models.CharField(max_length=80)
    aciklama = models.TextField(max_length=500, blank=True)
    yazar_adi = models.CharField(max_length=60, blank=True)
    plan = models.JSONField()
    onizleme = models.CharField(max_length=200, blank=True)   # MEDIA_ROOT'a göre göreli yol
    # Bütün tasarımlar herkese açık (kullanıcı kararı 2026-10-06). galeride yalnız şikâyet
    # eşiğinde kendiliğinden False olur: listeden düşer, bağlantısı açık kalır, yönetici bakar.
    galeride = models.BooleanField(default=True)
    # Şablon: başkalarının yeni tasarıma başlangıç olarak kullanması için sunulan tasarım
    sablon = models.BooleanField(default=False)
    # Moderasyon (yalnız yönetici): gizli tasarım listede görünmez, bağlantısı da açılmaz
    gizli = models.BooleanField(default=False)
    etiketler = models.ManyToManyField(Etiket, blank=True, related_name="tasarimlar")
    kaynak = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="kopyalar")
    anahtar_ozeti = models.CharField(max_length=64)
    ip_ozeti = models.CharField(max_length=64, db_index=True)
    begeni_sayisi = models.PositiveIntegerField(default=0)
    kopya_sayisi = models.PositiveIntegerField(default=0)
    goruntulenme = models.PositiveIntegerField(default=0)
    sikayet_sayisi = models.PositiveIntegerField(default=0)
    olusturma = models.DateTimeField(auto_now_add=True)
    guncelleme = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-olusturma"]
        indexes = [models.Index(fields=["galeride", "gizli", "-olusturma"]),
                   models.Index(fields=["galeride", "gizli", "-begeni_sayisi"]),
                   models.Index(fields=["sablon", "galeride", "gizli", "-olusturma"])]

    def __str__(self):
        return f"{self.kod} · {self.baslik}"

    def anahtar_dogru(self, anahtar: str) -> bool:
        return bool(anahtar) and hmac.compare_digest(self.anahtar_ozeti, anahtar_ozeti(anahtar))


class Begeni(models.Model):
    tasarim = models.ForeignKey(Tasarim, on_delete=models.CASCADE, related_name="begeniler")
    ip_ozeti = models.CharField(max_length=64)
    tarih = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["tasarim", "ip_ozeti"], name="tekil_begeni")]


class Sikayet(models.Model):
    tasarim = models.ForeignKey(Tasarim, on_delete=models.CASCADE, related_name="sikayetler")
    ip_ozeti = models.CharField(max_length=64)
    neden = models.CharField(max_length=200, blank=True)
    tarih = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["tasarim", "ip_ozeti"], name="tekil_sikayet")]
