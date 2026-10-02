# tarus Tasarla

`tasarla.tarus.tr` — konut planı üzerinde 2B tefriş ve 3B mekân tasarımı.
tarus ekosisteminin bir parçasıdır: giriş Pusula SSO ile yapılır, plan tek
adımda Pusula teklif ya da proje kaydına aktarılır.

Motor, açık kaynak [floorplan-3d](https://github.com/wy51ai/floorplan-3d)
projesinden (MIT) çatallanmıştır; ayrıntı: [UCUNCU-TARAF-LISANSLARI.md](UCUNCU-TARAF-LISANSLARI.md).

## Özellikler

**2B plan**
- 1:50 / 1:100 ölçekte gösterim; ölçüler cm, alanlar m²
- Kütüphaneden sürükle-bırak; döndürme (Shift: serbest açı), boyutlandırma, duvara yaslama
- Ölçü aracı (duvara yapışır, Shift yatay/düşey kilitler)
- Taşıyıcı olmayan duvarı yıkma; taşıyıcı duvarlar ayrı gösterilir
- Katmanlar: ölçüler, mahal adları, mobilya, ızgara, taşıyıcılar

**3B sahne**
- Yörünge, perspektif ve tepeden görünüm; mahal listesinden mahale uçuş
- Gezinti: masaüstünde WASD + fare, dokunmatikte sanal çubuk; kapılar açılır
- Tam / kesit duvar, gün ışığı saati, gece aydınlatması
- 3B'de de mobilya seçilip taşınır, 2B ile eşzamanlıdır

**Tefriş kütüphanesi (YH11)** — `js/kutuphane.js`
- Türkiye'de yaygın ölçüler: 160×200 / 180×200 yatak, 60 cm tezgâh, 35 cm üst dolap,
  80×80 / 90×90 / 80×120 duşakabin, 170×70 küvet, 60×60 beyaz eşya
- Yerel donatılar: kombi, panel radyatör, havlupan, hela taşı, çekyat, berjer, zigon sehpa
- Kütüphanede arama

**Plan özeti ve Pusula (YH13)**
- Mahal alanları, net kullanım alanı, döşeme maliyet tahmini (%5 fire, ₺)
- «Pusula'ya aktar»: önizleme + kullanıcı onayıyla
  - yeni **teklif** (Taslak, sıradaki TKL no, plan özeti notta),
  - yeni **proje** (Tasarım kategorisi) ya da **mevcut projeye** ekleme;
    plan görseli (PNG) ve plan dosyası (JSON) projenin `07 Belgeler` klasörüne yüklenir.
- Pusula'ya veri yalnız kullanıcının işlemiyle, Pusula API'si üzerinden girer
  (ozluk/tarus.md §4.2 "Veri girişi").

**Kabuk**
- tarus-standartlar teması (8 tema, `tarus-theme` çereziyle uygulamalar arası ortak),
  toolbar reçetesi, Lucide ikonları, Inter yazı tipi
- Pusula SSO (belirteçler yalnız bellekte), kullanıcı menüsü, Hakkında ve sürüm notları
- Sağ tık menüsü ve hata bildirimi (çizim alanı dışında)
- Plan tarayıcıda (`localStorage`) saklanır; PNG / JSON indirme ve JSON yükleme

## Çalıştırma

Derleme adımı yoktur; statik dosyalar olarak sunulur.

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Yerelde (localhost) Pusula'ya otomatik yönlendirme yapılmaz; uygulama "Yerel
çalışma" modunda açılır, Pusula işlemleri kullanıcı menüsündeki
«Pusula'ya bağlan» ile başlar. three.js jsDelivr'dan yüklenir; 3B için internet gerekir.

## Testler

```bash
npm test          # birim testleri (node:test): aktarım, kütüphane, Türkçeleştirme, sürüm
npm run test:e2e  # Playwright ile uçtan uca: Pusula taklit edilerek giriş, teklif, proje, Arkiv yüklemesi
```

## Yayın

Coolify'da Dockerfile ile (Caddy, statik). Adımlar: [docs/RUNBOOK-yayin.md](docs/RUNBOOK-yayin.md).

## Kısayollar

| Tuş | İşlev |
| --- | --- |
| `T` | 2B / 3B geçişi |
| `V` / `M` / `X` | Seç / ölçü / duvar yık |
| `R` / `Shift+R` | Seçili mobilyayı 90° saat yönünde / tersine döndür |
| Ok tuşları (`Shift`) | 1 cm (10 cm) kaydır |
| `Delete` / `Backspace` | Seçili mobilyayı sil |
| `Ctrl/⌘ + D` | Çoğalt |
| `Ctrl/⌘ + Z`, `Ctrl/⌘ + Shift + Z` | Geri al, yinele |
| `F` | Pencereye sığdır |
| `+` / `-` | Yakınlaştır / uzaklaştır |
| `[` / `]` | Kütüphane / özellikler panelini aç-kapat |
| `Shift + F` | Tam ekran |
| `Esc` | Seçimi bırak / işlemi iptal et |
| Gezinti: `WASD` / oklar, `Shift`, `E` | Yürü, hızlı, kapıyı aç |

## Dosyalar

| Dosya | İçerik |
| --- | --- |
| `index.html` | Plan verisi (`ROOMS`, `WALLS`, `WINS`, `MATS`), 2B düzenleyici, 3B sahne |
| `js/kutuphane.js` | Tefriş kütüphanesi (ölçüler cm) |
| `js/kabuk.js` | Toast, diyalog, menüler, tema seçici, Hakkında, Pusula oturumu, «Pusula'ya aktar» |
| `js/pusula-oturum.js` | Pusula SSO (Model 3.0.0 deseni) |
| `js/pusula-aktar.js` | Plan özeti ve Pusula teklif/proje/Arkiv istekleri |
| `js/tema.js`, `js/ikonlar.js`, `js/surum.js` | Tema çerezi, Lucide ikonları, sürüm ve notlar |
| `styles/tarus.css`, `styles/tarus-toolbar.css`, `public/tarus-context-menu.js` | ozluk/tarus-kabuk'tan bayt bayt kopya |
| `styles/tasarla.css` | Uygulama stilleri |
