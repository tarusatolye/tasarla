# Runbook — tasarla.tarus.tr yayını

Kod hazır; aşağıdaki adımlar **sende** (Coolify, DNS, Pusula yayını). Sıra önemli:
Pusula'daki köken izni olmadan Tasarla'da giriş `400` ile döner.

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

- `tasarla.tarus.tr` → Coolify sunucusu (diğer ekosistem uygulamalarıyla aynı kayıt türü;
  Cloudflare kullanılıyorsa proxy ve "Only Turkey Access" kuralı Pusula'daki gibi).

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

1. `https://tasarla.tarus.tr/version.json` → `{"app":"tasarla","version":"0.0.4","commit":"<sha>",...}`
2. Pusula'da oturum açıkken `https://tasarla.tarus.tr` aç: Pusula'ya kısa bir yönlendirme,
   ardından sağ üstte adın ve şirketin görünmeli. Pusula oturumu yoksa giriş sayfasına gider,
   girişten sonra Tasarla'ya döner.
3. «Pusula'ya aktar» → Yeni teklif → müşteri adı → Onayla: Pusula → Teklifler'de
   sıradaki `TKL-YYYY-NNN` numarasıyla «Taslak» teklif, notunda plan özeti.
4. «Pusula'ya aktar» → Yeni proje → malik → Onayla: Pusula → Projeler'de «Tasarım»
   kategorisinde proje; Arkiv → proje → `07 Belgeler` altında plan görseli (PNG) ve plan
   dosyası (JSON).
5. Tema: Pusula'da tema değiştir, Tasarla sekmesine dön → aynı tema (ortak `tarus-theme` çerezi).
6. Sağ tık (çizim alanı dışında) → «Hata bildir» → gönder → sistem.tarus.tr Hata panosunda
   uygulama adı `tasarla.tarus.tr`.

Bu adımlar canlı test maddesi olarak `ozluk/acik-isler.md`'de YH7 / YH13 satırlarında izlenir.

## Geri alma

Coolify'da önceki dağıtımı yeniden başlat. Pusula köken satırı geri alınmak istenirse
Tasarla'da giriş ve aktarım durur; plan verisi kullanıcıların tarayıcısında kalır.
