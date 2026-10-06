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

    def test_anahtarsiz_guncelleme_ve_silme_reddedilir(self):
        y = self.kaydet()
        kod, anahtar = y.data["kod"], y.data["anahtar"]
        govde = {"baslik": "Yeni ad", "plan": plan()}
        self.assertEqual(self.c.put(f"/api/tasarimlar/{kod}/", govde, format="json").status_code, 403)
        self.assertEqual(self.c.put(f"/api/tasarimlar/{kod}/", govde, format="json", HTTP_X_TASARLA_ANAHTAR="yanlis").status_code, 403)
        self.assertEqual(self.c.delete(f"/api/tasarimlar/{kod}/").status_code, 403)
        g = self.c.put(f"/api/tasarimlar/{kod}/", govde, format="json", HTTP_X_TASARLA_ANAHTAR=anahtar)
        self.assertEqual(g.status_code, 200)
        self.assertEqual(Tasarim.objects.get(kod=kod).baslik, "Yeni ad")
        self.assertEqual(self.c.delete(f"/api/tasarimlar/{kod}/", HTTP_X_TASARLA_ANAHTAR=anahtar).status_code, 204)
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

    def test_galeri_yalniz_galerideki_ve_gizli_olmayanlar_plan_yok(self):
        a = self.kaydet(baslik="A").data["kod"]
        self.kaydet(baslik="B", galeride=False)
        g = self.kaydet(baslik="C").data["kod"]
        Tasarim.objects.filter(kod=g).update(gizli=True)
        y = self.c.get("/api/galeri/")
        self.assertEqual([t["kod"] for t in y.data["sonuclar"]], [a])
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
