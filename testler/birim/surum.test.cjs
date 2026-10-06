const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../js/surum.js');

test('sürüm A.B.C, v öneki yok; en üst not güncel sürüm', () => {
  assert.match(S.APP_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(S.SURUM_NOTLARI[0].surum, S.APP_VERSION);
});

test('uygulama içi sürüm notu en çok 3 cümle', () => {
  for (const n of S.SURUM_NOTLARI){
    const cumle = n.not.split(/(?<=[.!?])\s+/).filter(Boolean);
    assert.ok(cumle.length <= 3, `${n.surum}: ${cumle.length} cümle`);
  }
});

// Cloudflare tarayıcı önbelleği nginx'in `no-cache`'ini 4 saatlik max-age ile eziyor; dosya adları
// sürümsüz olduğu için yayından sonra yeni HTML eski JS ile açılıyordu (0.1.1). Yerel betik ve
// stiller `?v=<sürüm>` taşır; sürüm artınca bu test hepsinin güncellenmesini ister.
test('index.html yerel betik ve stilleri güncel sürümle önbellekten kırılır', () => {
  const fs = require('node:fs'), path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const yerel = [...html.matchAll(/(?:src|href)="((?:js|styles)\/[\w-]+\.(?:js|css))(\?v=[^"]*)?"/g)];
  assert.ok(yerel.length >= 10, 'yerel dosya bulunamadı');
  for (const [, dosya, v] of yerel) assert.equal(v, `?v=${S.APP_VERSION}`, `${dosya} sürüm parametresi yok ya da eski`);
});
