import base64
import io
import shutil
import tempfile
from pathlib import Path
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from .models import Tasarim

GECICI_MEDYA = tempfile.mkdtemp()


def plan(**ek):
    p = {"furniture": [{"id": "f1", "type": "bed", "name": "Yatak", "cx": 100, "cy": 200, "w": 1600, "d": 2000, "rot": 0, "color": "#c9d6df"}],
         "rooms": {"salon": {"name": "Salon", "mat": "parke"}}, "demolished": ["w34"],
         "measures": [{"a": {"x": 0, "y": 0}, "b": {"x": 100, "y": 0}}]}
    p.update(ek)
    return p


def png(boyut=(40, 30)):
    b = io.BytesIO()
    Image.new("RGB", boyut, "#ffcc00").save(b, "PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


@override_settings(MEDIA_ROOT=GECICI_MEDYA, MODERASYON_TOKEN="mod-anahtar", SIKAYET_ESIGI=2)
class TasarimTestleri(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(GECICI_MEDYA, ignore_errors=True)

    def setUp(self):
        cache.clear()
        self.c = APIClient()

    def kaydet(self, **ek):
        govde = {"baslik": "Salonum", "yazar_adi": "Ayşe", "plan": plan(), "onizleme": png(), **ek}
        return self.c.post("/api/tasarimlar/", govde, format="json")

    def test_kayit_anahtar_bir_kez_doner_ozeti_saklanir(self):
        y = self.kaydet()
        self.assertEqual(y.status_code, 201, y.content)
        kod, anahtar = y.data["kod"], y.data["anahtar"]
        t = Tasarim.objects.get(kod=kod)
        self.assertNotEqual(t.anahtar_ozeti, anahtar)
        self.assertTrue(t.anahtar_dogru(anahtar))
        self.assertTrue(y.data["onizleme"].startswith("/api/medya/onizleme/"))
        g = self.c.get(f"/api/tasarimlar/{kod}/")
        self.assertNotIn("anahtar", g.data)
        self.assertFalse(g.data["sahibi"])
        self.assertTrue(self.c.get(f"/api/tasarimlar/{kod}/", HTTP_X_TASARLA_ANAHTAR=anahtar).data["sahibi"])
        self.assertEqual(g.data["plan"]["furniture"][0]["name"], "Yatak")

    def test_sahibi_gunceller_ama_silemez_yalniz_yonetici_siler(self):
        y = self.kaydet()
        kod, anahtar = y.data["kod"], y.data["anahtar"]
        govde = {"baslik": "Yeni ad", "plan": plan()}
        self.assertEqual(self.c.put(f"/api/tasarimlar/{kod}/", govde, format="json").status_code, 403)
        self.assertEqual(self.c.put(f"/api/tasarimlar/{kod}/", govde, format="json", HTTP_X_TASARLA_ANAHTAR="yanlis").status_code, 403)
        self.assertEqual(self.c.delete(f"/api/tasarimlar/{kod}/").status_code, 403)
        g = self.c.put(f"/api/tasarimlar/{kod}/", govde, format="json", HTTP_X_TASARLA_ANAHTAR=anahtar)
        self.assertEqual(g.status_code, 200)
        self.assertEqual(Tasarim.objects.get(kod=kod).baslik, "Yeni ad")
        self.assertEqual(self.c.delete(f"/api/tasarimlar/{kod}/", HTTP_X_TASARLA_ANAHTAR=anahtar).status_code, 403)
        self.assertTrue(Tasarim.objects.filter(kod=kod).exists())
        self.assertEqual(self.c.delete(f"/api/tasarimlar/{kod}/", HTTP_AUTHORIZATION="Bearer mod-anahtar").status_code, 204)
        self.assertFalse(Tasarim.objects.filter(kod=kod).exists())

    def test_svg_ozniteligine_giden_alanlar_kaliba_uymali(self):
        kotu = [
            {"color": '"><script>alert(1)</script>'},
            {"type": "bed\" onload=\"x"},
            {"id": "<img>"},
            {"cx": 1e12},
            {"w": "100"},
        ]
        for degisiklik in kotu:
            p = plan()
            p["furniture"][0].update(degisiklik)
            y = self.kaydet(plan=p)
            self.assertEqual(y.status_code, 400, degisiklik)
        p = plan(demolished=["w1; drop"])
        self.assertEqual(self.kaydet(plan=p).status_code, 400)
        p = plan(rooms={"salon": {"name": "Salon", "mat": "x\"y"}})
        self.assertEqual(self.kaydet(plan=p).status_code, 400)

    def test_bilinmeyen_alanlar_atilir(self):
        p = plan(gizli_alan="x")
        p["furniture"][0]["ekstra"] = "y"
        kod = self.kaydet(plan=p).data["kod"]
        kayitli = Tasarim.objects.get(kod=kod).plan
        self.assertNotIn("gizli_alan", kayitli)
        self.assertNotIn("ekstra", kayitli["furniture"][0])

    def test_onizleme_gorsel_olmali_ve_yeniden_kodlanir(self):
        sahte = "data:image/png;base64," + base64.b64encode(b"<svg onload=alert(1)>").decode()
        self.assertEqual(self.kaydet(onizleme=sahte).status_code, 400)
        self.assertEqual(self.kaydet(onizleme="javascript:alert(1)").status_code, 400)
        y = self.kaydet(onizleme=png((3000, 2000)))
        t = Tasarim.objects.get(kod=y.data["kod"])
        with Image.open(f"{GECICI_MEDYA}/{t.onizleme}") as g:
            self.assertEqual(g.format, "WEBP")
            self.assertLessEqual(max(g.size), 1600)

    def test_bal_kupu_dolu_ise_kayit_yapilmaz(self):
        self.kaydet(web_sitesi="http://spam")
        self.assertEqual(Tasarim.objects.count(), 0)

    def test_butun_tasarimlar_herkese_acik_gizlenen_haric_plan_yok(self):
        a = self.kaydet(baslik="A").data["kod"]
        b = self.kaydet(baslik="B", galeride=False).data["kod"]   # eski istemci alanı yok sayılır
        g = self.kaydet(baslik="C").data["kod"]
        Tasarim.objects.filter(kod=g).update(gizli=True)
        y = self.c.get("/api/galeri/")
        self.assertEqual([t["kod"] for t in y.data["sonuclar"]], [b, a])
        self.assertNotIn("plan", y.data["sonuclar"][0])
        self.assertEqual(self.c.get(f"/api/tasarimlar/{g}/").status_code, 404)

    def test_begeni_ziyaretci_basina_bir_ve_siralama(self):
        a = self.kaydet(baslik="A").data["kod"]
        b = self.kaydet(baslik="B").data["kod"]
        self.c.post(f"/api/tasarimlar/{a}/begen/")
        y = self.c.post(f"/api/tasarimlar/{a}/begen/")
        self.assertEqual(y.data["begeni_sayisi"], 1)
        self.c.post(f"/api/tasarimlar/{a}/begen/", REMOTE_ADDR="10.0.0.9", HTTP_X_FORWARDED_FOR="10.0.0.9")
        self.assertEqual(Tasarim.objects.get(kod=a).begeni_sayisi, 2)
        self.assertEqual([t["kod"] for t in self.c.get("/api/galeri/?sira=begeni").data["sonuclar"]], [a, b])
        self.assertEqual([t["kod"] for t in self.c.get("/api/galeri/").data["sonuclar"]], [b, a])

    def test_sikayet_esigi_galeriden_dusurur(self):
        kod = self.kaydet().data["kod"]
        self.c.post(f"/api/tasarimlar/{kod}/sikayet/", {"neden": "uygunsuz"}, format="json")
        self.c.post(f"/api/tasarimlar/{kod}/sikayet/", {"neden": "uygunsuz"}, format="json")   # aynı kişi sayılmaz
        self.assertTrue(Tasarim.objects.get(kod=kod).galeride)
        self.c.post(f"/api/tasarimlar/{kod}/sikayet/", {}, format="json", HTTP_X_FORWARDED_FOR="10.0.0.7")
        t = Tasarim.objects.get(kod=kod)
        self.assertEqual(t.sikayet_sayisi, 2)
        self.assertFalse(t.galeride)

    def test_kopya_kaynagi_sayilir(self):
        a = self.kaydet().data["kod"]
        b = self.kaydet(kaynak=a).data["kod"]
        self.assertEqual(Tasarim.objects.get(kod=a).kopya_sayisi, 1)
        self.assertEqual(self.c.get(f"/api/tasarimlar/{b}/").data["kaynak"], a)

    def test_moderasyon_yalniz_tokenla(self):
        kod = self.kaydet().data["kod"]
        self.assertEqual(self.c.post(f"/api/moderasyon/{kod}/", {"gizli": True}, format="json").status_code, 403)
        self.assertEqual(self.c.post(f"/api/moderasyon/{kod}/", {"gizli": True}, format="json", HTTP_AUTHORIZATION="Bearer yanlis").status_code, 403)
        y = self.c.post(f"/api/moderasyon/{kod}/", {"gizli": True}, format="json", HTTP_AUTHORIZATION="Bearer mod-anahtar")
        self.assertEqual(y.status_code, 200)
        self.assertTrue(Tasarim.objects.get(kod=kod).gizli)

    @override_settings(MODERASYON_TOKEN="")
    def test_moderasyon_tokeni_yoksa_uc_kapali(self):
        kod = self.kaydet().data["kod"]
        self.assertEqual(self.c.post(f"/api/moderasyon/{kod}/", {"gizli": True}, format="json", HTTP_AUTHORIZATION="Bearer ").status_code, 403)

    def test_kayit_hiz_siniri(self):
        from .views import KayitSiniri
        with mock.patch.object(KayitSiniri, "THROTTLE_RATES", {"kayit": "2/hour"}):
            self.assertEqual(self.kaydet().status_code, 201)
            self.assertEqual(self.kaydet().status_code, 201)
            self.assertEqual(self.kaydet().status_code, 429)

    def test_sablon_olarak_eklenir_ve_suzulur(self):
        a = self.kaydet(baslik="Düz").data["kod"]
        s = self.kaydet(baslik="Şablon", sablon=True)
        self.assertTrue(s.data["sablon"])
        self.assertEqual([t["kod"] for t in self.c.get("/api/galeri/?tur=sablon").data["sonuclar"]], [s.data["kod"]])
        self.assertEqual(len(self.c.get("/api/galeri/").data["sonuclar"]), 2)
        # sahibi şablonu kaldırabilir
        self.c.put(f"/api/tasarimlar/{s.data['kod']}/", {"baslik": "Şablon", "plan": plan(), "sablon": False}, format="json",
                   HTTP_X_TASARLA_ANAHTAR=s.data["anahtar"])
        self.assertEqual(self.c.get("/api/galeri/?tur=sablon").data["sonuclar"], [])
        self.assertTrue(Tasarim.objects.filter(kod=a).exists())

    def _pusula(self, rol, kod=200):
        """Pusula /auth/me/ taklidi: urlopen verilen rolü döndürür (ya da HTTP hatası)."""
        import json
        import urllib.error

        class Yanit(io.BytesIO):
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        def ac(istek, timeout=None):
            self.pusula_istekleri.append(istek)
            if kod != 200:
                raise urllib.error.HTTPError(istek.full_url, kod, "", {}, None)
            return Yanit(json.dumps({"role": rol}).encode())
        self.pusula_istekleri = []
        return mock.patch("galeri.yonetici.urllib.request.urlopen", ac)

    def test_pusula_superadmin_siler_gizler_ve_inceleme_listesini_gorur(self):
        kod = self.kaydet().data["kod"]
        jwt = "a.b.c"
        with self._pusula("SUPERADMIN"):
            self.assertTrue(self.c.get("/api/yonetici/", HTTP_AUTHORIZATION=f"Bearer {jwt}").data["yonetici"])
            self.c.post(f"/api/tasarimlar/{kod}/sikayet/", {}, format="json")
            liste = self.c.get("/api/galeri/?tur=inceleme", HTTP_AUTHORIZATION=f"Bearer {jwt}").data["sonuclar"]
            self.assertEqual([(t["kod"], t["sikayet_sayisi"]) for t in liste], [(kod, 1)])
            y = self.c.post(f"/api/moderasyon/{kod}/", {"gizli": True}, format="json", HTTP_AUTHORIZATION=f"Bearer {jwt}")
            self.assertEqual(y.status_code, 200)
            self.assertEqual(self.c.delete(f"/api/tasarimlar/{kod}/", HTTP_AUTHORIZATION=f"Bearer {jwt}").status_code, 204)
        self.assertEqual(self.pusula_istekleri[0].full_url, "https://pusula.tarus.tr/auth/me/")
        self.assertEqual(len(self.pusula_istekleri), 1, "rol önbelleğe alınmadı")

    def test_pusula_yonetici_olmayan_rol_ve_gecersiz_oturum_reddedilir(self):
        kod = self.kaydet().data["kod"]
        with self._pusula("COMPANY_ADMIN"):
            self.assertFalse(self.c.get("/api/yonetici/", HTTP_AUTHORIZATION="Bearer x.y.z").data["yonetici"])
            self.assertEqual(self.c.delete(f"/api/tasarimlar/{kod}/", HTTP_AUTHORIZATION="Bearer x.y.z").status_code, 403)
            self.assertEqual(self.c.get("/api/galeri/?tur=inceleme", HTTP_AUTHORIZATION="Bearer x.y.z").status_code, 403)
        cache.clear()
        with self._pusula("", kod=401):
            self.assertEqual(self.c.delete(f"/api/tasarimlar/{kod}/", HTTP_AUTHORIZATION="Bearer q.w.e").status_code, 403)
        self.assertFalse(self.c.get("/api/yonetici/").data["yonetici"])
        self.assertTrue(Tasarim.objects.filter(kod=kod).exists())


@override_settings(MEDIA_ROOT=GECICI_MEDYA, MODERASYON_TOKEN="mod-anahtar")
class AramaVeEtiketTestleri(TestCase):
    def setUp(self):
        cache.clear()
        self.c = APIClient()

    def kaydet(self, **ek):
        govde = {"baslik": "Salonum", "plan": plan(), **ek}
        return self.c.post("/api/tasarimlar/", govde, format="json")

    def kodlar(self, sorgu):
        return [t["kod"] for t in self.c.get(f"/api/galeri/{sorgu}").data["sonuclar"]]

    def test_etiketler_temizlenir_ve_doner(self):
        y = self.kaydet(etiketler=["  Salon ", "#İskandinav", "salon", "Işıklı   Mutfak", ""])
        self.assertEqual(y.status_code, 201, y.content)
        self.assertEqual(y.data["etiketler"], ["iskandinav", "salon", "ışıklı mutfak"])
        self.assertEqual(self.c.get(f"/api/tasarimlar/{y.data['kod']}/").data["etiketler"],
                         ["iskandinav", "salon", "ışıklı mutfak"])
        # virgüllü metin de kabul edilir
        self.assertEqual(self.kaydet(etiketler="banyo, küçük ev").data["etiketler"], ["banyo", "küçük ev"])

    def test_gecersiz_etiket_reddedilir(self):
        for kotu in (["a" * 25], ["<script>"], ["a_b"], [1], ["a", "b", "c", "d", "e", "f"], {"a": 1}):
            self.assertEqual(self.kaydet(etiketler=kotu).status_code, 400, kotu)
        self.assertEqual(Tasarim.objects.count(), 0)

    def test_guncellemede_etiket_verilmezse_korunur_verilirse_degisir(self):
        y = self.kaydet(etiketler=["salon"])
        kod, anahtar = y.data["kod"], y.data["anahtar"]
        g = self.c.put(f"/api/tasarimlar/{kod}/", {"baslik": "Yeni", "plan": plan()}, format="json", HTTP_X_TASARLA_ANAHTAR=anahtar)
        self.assertEqual(g.data["etiketler"], ["salon"])
        g = self.c.put(f"/api/tasarimlar/{kod}/", {"baslik": "Yeni", "plan": plan(), "etiketler": ["mutfak"]}, format="json",
                       HTTP_X_TASARLA_ANAHTAR=anahtar)
        self.assertEqual(g.data["etiketler"], ["mutfak"])
        g = self.c.put(f"/api/tasarimlar/{kod}/", {"baslik": "Yeni", "plan": plan(), "etiketler": []}, format="json",
                       HTTP_X_TASARLA_ANAHTAR=anahtar)
        self.assertEqual(g.data["etiketler"], [])
        # anahtarsız etiket değişikliği yok
        self.assertEqual(self.c.put(f"/api/tasarimlar/{kod}/", {"baslik": "X", "plan": plan(), "etiketler": ["spam"]},
                                    format="json").status_code, 403)

    def test_arama_baslik_aciklama_ve_etiket(self):
        a = self.kaydet(baslik="Ferah salon", aciklama="Güneyde").data["kod"]
        b = self.kaydet(baslik="Yatak odası", aciklama="Çalışma köşeli, ferah").data["kod"]
        c = self.kaydet(baslik="Mutfak", etiketler=["şık mutfak"]).data["kod"]
        self.assertEqual(self.kodlar("?q=ferah"), [b, a])
        self.assertEqual(self.kodlar("?q=FERAH"), [b, a])
        self.assertEqual(self.c.get("/api/galeri/", {"q": "Çalışma"}).data["toplam"], 1)
        self.assertEqual([t["kod"] for t in self.c.get("/api/galeri/", {"q": "çalışma"}).data["sonuclar"]], [b])
        self.assertEqual([t["kod"] for t in self.c.get("/api/galeri/", {"q": "ŞIK"}).data["sonuclar"]], [c])
        self.assertEqual(self.kodlar("?q=yok-boyle-bir-sey"), [])
        self.assertEqual(len(self.kodlar("?q=")), 3)
        self.assertEqual(self.c.get("/api/galeri/?q=ferah").data["toplam"], 2)

    def test_etiket_suzgeci_tur_ve_arama_ile_birlikte(self):
        a = self.kaydet(baslik="Kuzey", etiketler=["salon"]).data["kod"]
        b = self.kaydet(baslik="Güney", etiketler=["salon", "mutfak"], sablon=True).data["kod"]
        self.kaydet(baslik="Doğu", etiketler=["mutfak"])
        self.assertEqual(self.kodlar("?etiket=salon"), [b, a])
        self.assertEqual(self.kodlar("?etiket=Salon"), [b, a])
        self.assertEqual(self.kodlar("?etiket=salon&tur=sablon"), [b])
        self.assertEqual(self.kodlar("?etiket=salon&q=kuzey"), [a])
        self.assertEqual(self.kodlar("?etiket=bilinmeyen"), [])

    def test_populer_etiketler_gizli_ve_galeri_disi_sayilmaz(self):
        self.kaydet(etiketler=["salon", "mutfak"])
        self.kaydet(etiketler=["salon"])
        g = self.kaydet(etiketler=["gizli etiket"]).data["kod"]
        Tasarim.objects.filter(kod=g).update(gizli=True)
        d = self.kaydet(etiketler=["düşen"]).data["kod"]
        Tasarim.objects.filter(kod=d).update(galeride=False)
        self.kaydet(etiketler=["sablonluk"], sablon=True)
        y = self.c.get("/api/etiketler/").data["etiketler"]
        self.assertEqual(y, [{"ad": "salon", "sayi": 2}, {"ad": "mutfak", "sayi": 1}, {"ad": "sablonluk", "sayi": 1}])
        self.assertEqual(self.c.get("/api/etiketler/?tur=sablon").data["etiketler"], [{"ad": "sablonluk", "sayi": 1}])

    def test_moderasyon_arama_ve_etiketle_degismez(self):
        kod = self.kaydet(baslik="Ferah", etiketler=["salon"]).data["kod"]
        self.assertEqual(self.c.delete(f"/api/tasarimlar/{kod}/?q=ferah").status_code, 403)
        self.assertEqual(self.c.get("/api/galeri/?tur=inceleme&q=ferah").status_code, 403)
        self.assertEqual(self.c.delete(f"/api/tasarimlar/{kod}/", HTTP_AUTHORIZATION="Bearer mod-anahtar").status_code, 204)


@override_settings(MEDIA_ROOT=GECICI_MEDYA, SITE_URL="https://tasarla.tarus.tr")
class PaylasimMetaTestleri(TestCase):
    def setUp(self):
        cache.clear()
        self.c = APIClient()

    def meta(self, t):
        y = self.c.get("/api/paylasim-meta/", {"t": t})
        self.assertEqual(y.status_code, 200)
        self.assertTrue(y["Content-Type"].startswith("text/html"))
        return y.content.decode()

    def test_tasarim_icin_baslik_aciklama_ve_mutlak_https_gorsel(self):
        y = self.c.post("/api/tasarimlar/", {"baslik": "Ferah <salon>", "aciklama": 'Güney cepheli "aydınlık" salon',
                                             "plan": plan(), "onizleme": png((120, 90)), "etiketler": ["salon"]}, format="json")
        kod = y.data["kod"]
        h = self.meta(kod)
        self.assertIn('<meta property="og:title" content="Ferah &lt;salon&gt; · tarus Tasarla">', h)
        self.assertIn('content="Güney cepheli &quot;aydınlık&quot; salon · salon"', h)
        self.assertIn(f'<meta property="og:url" content="https://tasarla.tarus.tr/?t={kod}">', h)
        self.assertRegex(h, rf'<meta property="og:image" content="https://tasarla\.tarus\.tr/api/medya/onizleme/{kod}\.webp\?v=\d+">')
        self.assertIn('<meta property="og:image:width" content="120">', h)
        self.assertIn('<meta name="twitter:card" content="summary_large_image">', h)
        self.assertNotIn("<salon>", h)
        # Görsel adresi girişsiz açılan medya yolunda (nginx /api/medya/); dosya diskte var
        t = Tasarim.objects.get(kod=kod)
        self.assertTrue((Path(GECICI_MEDYA) / t.onizleme).exists())

    def test_aciklamasiz_ve_gorselsiz_tasarim(self):
        kod = self.c.post("/api/tasarimlar/", {"baslik": "Plan", "yazar_adi": "Ayşe", "plan": plan()}, format="json").data["kod"]
        h = self.meta(kod)
        self.assertIn("Ayşe tarafından tarus Tasarla&#x27;da paylaşılan konut planı", h)
        self.assertIn('content="https://tasarla.tarus.tr/public/icon-512.png"', h)
        self.assertIn('<meta name="twitter:card" content="summary">', h)

    def test_olmayan_gizli_ve_bozuk_kodda_varsayilan_meta(self):
        kod = self.c.post("/api/tasarimlar/", {"baslik": "Gizli ad", "plan": plan()}, format="json").data["kod"]
        Tasarim.objects.filter(kod=kod).update(gizli=True)
        for t in (kod, "yokboylebir", "", "../etc", "<x>", "a" * 40):
            h = self.meta(t)
            self.assertIn('<meta property="og:title" content="tarus Tasarla">', h, t)
            self.assertIn('<meta property="og:url" content="https://tasarla.tarus.tr/">', h, t)
            self.assertNotIn("Gizli ad", h)

    def test_meta_goruntulenme_saymaz_ve_yalniz_get(self):
        kod = self.c.post("/api/tasarimlar/", {"baslik": "Plan", "plan": plan()}, format="json").data["kod"]
        self.meta(kod)
        self.assertEqual(Tasarim.objects.get(kod=kod).goruntulenme, 0)
        self.assertEqual(self.c.post("/api/paylasim-meta/", {"t": kod}).status_code, 405)
