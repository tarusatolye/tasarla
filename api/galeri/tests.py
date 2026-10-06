import base64
import io
import shutil
import tempfile
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
