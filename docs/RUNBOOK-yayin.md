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
| Alan adı | `http://tasarla.tarus.tr` — Coolify'da **http** (diğer uygulamalar gibi): TLS Cloudflare'de biter, tünel içeriye http taşır; `https://` yazılırsa Coolify http→https yönlendirir ve sonsuz 302 döngüsü olur (2026-10-06). Ziyaretçi yine https görür, Pusula SSO dönüşü etkilenmez |
| Ortam değişkeni | yok (statik uygulama; `SOURCE_COMMIT` Coolify tarafından derlemeye verilir) |
| Kalıcı disk | yok (plan kullanıcının tarayıcısında, aktarılan kayıtlar Pusula'da) |
| Sağlık kontrolü | `GET /version.json` → 200 |

## 2b. Tasarım kaydetme ve galeri — Docker Compose'a geçiş (0.1.0)

Galeri ve Paylaş için `api/` servisi (Django) ve veritabanı gerekir. Yalnız Dockerfile
yayınında uygulama eskisi gibi çalışır; `/api/saglik/` 502 döndüğü için bu düğmeler gizli kalır.

1. **PostgreSQL** (önerilen): Coolify → yeni kaynak → PostgreSQL 16, ad `tasarla-postgres`,
   veritabanı `tasarla`. Sunucunun `coolify` ağında olmalı. Bağlantı adresini kopyala
   (iç ad + port 5432). Boş bırakılırsa SQLite `veri` biriminde tutulur.
2. **Uygulama kaynağı**: mevcut Tasarla kaynağında Build Pack → **Docker Compose**, dosya
   `docker-compose.yaml`. Alan adı `http://tasarla.tarus.tr` (https değil, tablo §2) yalnız **web** servisine,
   iç port 80. `tasarla-api` servisine alan adı verilmez (ad bilerek Tasarla'ya özgü: Coolify ortak ağında `api` adı yonetim'e çözülür).
3. **Ortam değişkenleri** (Coolify → Environment Variables):

   | Değişken | Değer |
   | --- | --- |
   | `DJANGO_SECRET_KEY` | uzun rastgele metin (`python -c "import secrets;print(secrets.token_urlsafe(50))"`), parola yöneticisine yedek. Değişirse IP özetleri değişir (beğeni sayıları korunur) |
   | `DATABASE_URL` | `postgres://<kullanıcı>:<parola>@<iç ad>:5432/tasarla` |
   | `TASARLA_MODERASYON_TOKEN` | ayrı rastgele metin (curl ile moderasyon); boşsa bu yol kapalı |
   | `TASARLA_YONETICI_ROLLERI` | (varsayılan `SUPERADMIN`) Pusula rolü bu listedeyse Tasarla yöneticisidir |
   | `PUSULA_URL` | (varsayılan `https://pusula.tarus.tr`) yönetici rolü `/auth/me/` ile buradan sorulur |
   | `DJANGO_ALLOWED_HOSTS` | (varsayılan `tasarla.tarus.tr`) |

4. **Kalıcı birimler**: `medya` (önizleme görselleri, web salt okunur bağlar) ve `veri`
   (SQLite kullanılıyorsa). Coolify'ın yedeğine eklenmeli; PostgreSQL'in yedeği kendi kaynağında.
5. Yayından sonra doğrulama:
   ```bash
   curl -s https://tasarla.tarus.tr/api/saglik/          # {"ok": true}
   curl -s https://tasarla.tarus.tr/api/galeri/          # {"sonuclar": [], ...}
   ```
   Tarayıcıda: üst çubukta **Galeri** ve **Paylaş** görünür → Paylaş → başlık → Kaydet:
   bağlantı `https://tasarla.tarus.tr/?t=<kod>`; gizli pencerede bağlantı tasarımı açar;
   Galeri'de kart, önizleme görseli, beğeni; «Şablon olarak ekle» → Şablonlar sekmesi, «Kullan».
   Kendi kartında Sil **yok** (kullanıcı kararı: silme yalnız yöneticide).
6. **Moderasyon** — silme ve gizleme yalnız yöneticide. Tasarla'da kullanıcı menüsü → «Pusula ile
   bağlan» (SUPERADMIN hesabı) → Galeri: kartlarda Gizle / Sil, «İnceleme» sekmesinde şikâyet
   alanlar. API rolü Pusula'nın `/auth/me/` ucuna sorar (tasarla-api konteynerinin pusula.tarus.tr'ye
   ulaşabilmesi gerekir). Sunucudan / curl ile:
   ```bash
   curl -X POST https://tasarla.tarus.tr/api/moderasyon/<kod>/ \
     -H "Authorization: Bearer $TASARLA_MODERASYON_TOKEN" -H 'Content-Type: application/json' \
     -d '{"gizli": true}'
   curl -X DELETE https://tasarla.tarus.tr/api/tasarimlar/<kod>/ -H "Authorization: Bearer $TASARLA_MODERASYON_TOKEN"
   ```
   3 farklı ziyaretçiden şikâyet alan tasarım kendiliğinden galeriden düşer (bağlantısı açık kalır).
   Cloudflare "Only Turkey Access" istisnası `/api/` yollarını da kapsamalı (Tasarla zaten istisnada).

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
