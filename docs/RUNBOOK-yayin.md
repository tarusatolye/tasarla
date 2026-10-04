# Runbook — tasarla.tarus.tr yayını

Kod hazır; aşağıdaki adımlar **sende** (Coolify, DNS, Pusula yayını). Sıra önemli:
Pusula'daki köken izni olmadan yalnız «Pusula ile bağlan» `400` ile döner; uygulamanın kendisi girişsiz çalışır.

## 0. Ön koşul — Pusula

1. Pusula'da `tasarla.tarus.tr` köken izni (pusula#128):
   `Backend/backend/settings.py` → `EKOSISTEM_ORIGINS`. Bu tek satır hem oturumlu
   CORS'u hem SSO dönüş adresi denetimini (`/auth/sso/authorize/?return=`) açar.
2. PR birleşince Pusula'yı Coolify'da yeniden yayınla.
3. Doğrulama (tarayıcı konsolu ya da curl):
   ```bash
   curl -sI -X OPTIONS https://pusula.tarus.tr/auth/me/ \
     -H 'Origin: https://tasarla.tarus.tr' -H 'Access-Control-Request-Method: GET' \
     | grep -i access-control-allow-origin
   # beklenen: access-control-allow-origin: https://tasarla.tarus.tr
   ```
   Not: `pusula.tarus.tr` Cloudflare "Only Turkey Access" arkasında; doğrulamayı Türkiye'den yap.

## 1. DNS

- `tasarla.tarus.tr` → Coolify sunucusu (diğer ekosistem uygulamalarıyla aynı kayıt türü).
- **Cloudflare (2026-10-04):** Tasarla herkese açık ve müşterilerle paylaşılır; "Only Turkey
  Access" kuralı `tasarla.tarus.tr`'yi **kapsamamalı** (istisna ekle). Pusula ve diğer
  uygulamalardaki kural aynen kalır; Tasarla misafirken Pusula'ya hiç istek atmaz.

## 2. Coolify kaynağı

| Ayar | Değer |
| --- | --- |
| Kaynak | GitHub `tarusatolye/tasarla`, dal `main` |
| Build Pack | Dockerfile (kökteki `Dockerfile`) |
| Ports Exposes | 80 (Dockerfile'daki nginx 80'i dinler) |
| Alan adı | `https://tasarla.tarus.tr` — **https** olmalı: Pusula SSO dönüş adresi yalnız https kabul eder |
| Ortam değişkeni | yok (statik uygulama; `SOURCE_COMMIT` Coolify tarafından derlemeye verilir) |
| Kalıcı disk | yok (plan kullanıcının tarayıcısında, aktarılan kayıtlar Pusula'da) |
| Sağlık kontrolü | `GET /version.json` → 200 |

## 3. Yayın sonrası doğrulama

1. `https://tasarla.tarus.tr/version.json` → `{"app":"tasarla","version":"0.0.8","commit":"<sha>",...}`
2. Gizli pencerede ve Türkiye dışından (ör. VPN) `https://tasarla.tarus.tr` aç: giriş
   istenmeden plan açılır, sağ üstte «Misafir», «Pusula'ya aktar» düğmesi görünmez.
   2B/3B geçişi, kütüphaneden mobilya ekleme, Dosya → PNG/JSON indirme çalışır.
   Kullanıcı menüsü → «Pusula ile bağlan» (tarus çalışanı): Pusula girişinden sonra
   Tasarla'ya dönülür, adın ve şirketin görünür, «Pusula'ya aktar» belirir.
3. «Pusula'ya aktar» → Yeni teklif → müşteri adı → Onayla: Pusula → Teklifler'de
   sıradaki `TKL-YYYY-NNN` numarasıyla «Taslak» teklif, notunda plan özeti.
4. «Pusula'ya aktar» → Yeni proje → malik → Onayla: Pusula → Projeler'de «Tasarım»
   kategorisinde proje; Arkiv → proje → `07 Belgeler` altında plan görseli (PNG) ve plan
   dosyası (JSON).
5. Tema: Pusula'da tema değiştir, Tasarla sekmesine dön → aynı tema (ortak `tarus-theme` çerezi).
6. Sağ tık (çizim alanı dışında) → «Hata / Fikir Bildir»: Pusula'ya bağlıyken sistem.tarus.tr
   Hata panosuna gider (uygulama adı `tasarla.tarus.tr`); misafirken destek@tarus.tr adresine
   e-posta taslağı açılır.

Bu adımlar canlı test maddesi olarak `ozluk/acik-isler.md`'de YH7 / YH13 satırlarında izlenir.

## Geri alma

Coolify'da önceki dağıtımı yeniden başlat. Pusula köken satırı geri alınırsa yalnız
Pusula bağlantısı ve aktarım durur; Tasarla misafir olarak çalışmaya devam eder, plan
verisi kullanıcıların tarayıcısında kalır.
