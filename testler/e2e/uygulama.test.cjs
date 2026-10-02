// Uçtan uca: uygulama gerçek tarayıcıda açılır, Pusula uçları taklit edilir (ağa gerçek istek gitmez).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const KOK = path.join(__dirname, '../..');
const TUR = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json'};
const PUSULA = 'https://pusula.tarus.tr';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `x.${b64({exp: Math.floor(Date.now() / 1000) + 3600})}.y`;
const KULLANICI = {id: 7, email: 'emre@ornek.tr', full_name: 'Emre Yıldırım', role: 'COMPANY_ADMIN', company_id: 'c1', company_name: 'tarus Mimarlık', avatar_url: ''};

let sunucu, adres, tarayici;
test.before(async () => {
  sunucu = http.createServer((req, res) => {
    const yol = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const dosya = path.join(KOK, yol === '/' ? 'index.html' : yol);
    if (!dosya.startsWith(KOK) || !fs.existsSync(dosya) || fs.statSync(dosya).isDirectory()){ res.writeHead(404); return res.end(); }
    res.writeHead(200, {'Content-Type': TUR[path.extname(dosya)] || 'application/octet-stream'});
    fs.createReadStream(dosya).pipe(res);
  });
  await new Promise(r => sunucu.listen(0, '127.0.0.1', r));
  adres = `http://localhost:${sunucu.address().port}`;
  tarayici = await chromium.launch();
});
test.after(async () => { await tarayici?.close(); sunucu?.close(); });

/* Pusula taklidi: istekleri kaydeder, yanıtları senaryoya göre verir */
async function sayfaAc({sso = false, teklifHata = false} = {}){
  const ctx = await tarayici.newContext({viewport: {width: 1440, height: 900}, ignoreHTTPSErrors: true});
  const sayfa = await ctx.newPage();
  const hatalar = [], istekler = [];
  sayfa.on('pageerror', e => hatalar.push(e.message));
  sayfa.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|WebGL|GPU stall/.test(m.text())) hatalar.push(m.text()); });
  // Yazı tipi gibi dış kaynaklar testte beklenmez
  await sayfa.route('https://fonts.googleapis.com/**', r => r.fulfill({status: 200, contentType: 'text/css', body: ''}));
  await sayfa.route(`${PUSULA}/**`, async route => {
    const req = route.request(), u = new URL(req.url()), yol = u.pathname, yontem = req.method();
    const kayit = {yontem, yol, ara: u.search, yetki: req.headers()['authorization'] || '', govde: req.postData() || ''};
    istekler.push(kayit);
    const json = (status, body) => route.fulfill({status, contentType: 'application/json', headers: {'Access-Control-Allow-Origin': adres, 'Access-Control-Allow-Credentials': 'true'}, body: JSON.stringify(body)});
    if (yontem === 'OPTIONS') return route.fulfill({status: 204, headers: {'Access-Control-Allow-Origin': adres, 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*'}});
    if (yol === '/auth/sso/exchange/') return json(200, {access: JWT, refresh: 'yenileme'});
    if (yol === '/auth/me/') return json(kayit.yetki === `Bearer ${JWT}` ? 200 : 401, KULLANICI);
    if (yol === '/teklifler/' && yontem === 'GET') return json(200, [{no: 'TKL-2026-004'}, {no: 'TKL-2026-011'}]);
    if (yol === '/teklifler/' && yontem === 'POST'){
      if (teklifHata) return json(400, {musteri: ['Bu alan boş bırakılamaz.']});
      return json(201, {id: 42, ...JSON.parse(kayit.govde)});
    }
    if (yol === '/projects/' && yontem === 'GET') return json(200, {count: 1, results: [{id: 'p-mevcut', ref_no: 'PRJ-2026-005', malik: 'Ali Kaya', il: 'Samsun', ilce: 'Atakum', mahalle: 'Körfez', ada: '101', parsel: '7'}]});
    if (yol === '/projects/' && yontem === 'POST') return json(201, {id: 'p-yeni', ref_no: 'PRJ-2026-031', ...JSON.parse(kayit.govde)});
    if (/^\/arkiv\/projects\/[^/]+\/documents\/$/.test(yol)) return json(201, {id: 'd1'});
    if (yol === '/auth/feedbacks/') return json(201, {});
    return json(404, {detail: 'yok'});
  });
  await sayfa.goto(`${adres}/index.html${sso ? '?sso_code=tek-kullanimlik' : ''}`);
  await sayfa.waitForSelector('#tarus-loader', {state: 'detached', timeout: 15000});
  return {ctx, sayfa, hatalar, istekler};
}

test('yerel modda açılır: Türkçe arayüz, tema, kütüphane araması, hatasız', async () => {
  const {ctx, sayfa, hatalar} = await sayfaAc();
  assert.equal(await sayfa.title(), 'tarus Tasarla');
  assert.equal(await sayfa.getAttribute('html', 'lang'), 'tr');
  assert.match(await sayfa.textContent('#kAd'), /Yerel çalışma/);
  assert.ok(await sayfa.evaluate(() => document.documentElement.classList.contains('theme-karanlik')));
  const govde = await sayfa.textContent('body');
  assert.ok(!/[一-鿿]/.test(govde), 'sayfada Çince metin var');
  assert.match(govde, /Mahal alanları/);
  assert.match(govde, /Net kullanım alanı/);

  await sayfa.fill('#libAra', 'kombi');
  const ogeler = await sayfa.$$eval('#lib .item b', el => el.map(e => e.textContent));
  assert.deepEqual(ogeler, ['Kombi']);

  const once = await sayfa.evaluate(() => TasarlaPlan.state().furniture.length);
  await sayfa.click('#lib .item');
  assert.equal(await sayfa.evaluate(() => TasarlaPlan.state().furniture.length), once + 1);
  assert.equal(await sayfa.inputValue('#fName'), 'Kombi');
  assert.match(await sayfa.textContent('#panel'), /Genişlik \(cm\)/);
  assert.deepEqual(hatalar, []);
  await ctx.close();
});

test('tema seçici: seçilen tema <html> sınıfına ve ortak çereze yazılır', async () => {
  const {ctx, sayfa, hatalar} = await sayfaAc();
  await sayfa.click('#temaBtn');
  await sayfa.click('[data-tema="sand"]');
  assert.ok(await sayfa.evaluate(() => document.documentElement.classList.contains('theme-sand')));
  const cerez = (await ctx.cookies()).find(c => c.name === 'tarus-theme');
  assert.equal(cerez?.value, 'sand');
  assert.deepEqual(hatalar, []);
  await ctx.close();
});

test('Pusula SSO: kod takas edilir, adres temizlenir, kullanıcı kartı dolar', async () => {
  const {ctx, sayfa, hatalar, istekler} = await sayfaAc({sso: true});
  assert.ok(!sayfa.url().includes('sso_code'));
  assert.equal(await sayfa.textContent('#kAd'), 'Emre Yıldırım');
  assert.equal(await sayfa.textContent('#kSirket'), 'tarus Mimarlık');
  const takas = istekler.find(i => i.yol === '/auth/sso/exchange/');
  assert.deepEqual(JSON.parse(takas.govde), {code: 'tek-kullanimlik'});
  assert.equal(istekler.find(i => i.yol === '/auth/me/').yetki, `Bearer ${JWT}`);
  assert.deepEqual(hatalar, []);
  await ctx.close();
});

test('oturum yokken aktarım Pusula girişine yönlendirmeyi önerir, istek atmaz', async () => {
  const {ctx, sayfa, istekler} = await sayfaAc();
  await sayfa.click('#pusulaAktar');
  await sayfa.waitForSelector('.tarus-dialog');
  assert.match(await sayfa.textContent('.tarus-dialog'), /Pusula oturumu gerekiyor/);
  await sayfa.keyboard.press('Escape');
  assert.equal(await sayfa.$('.tarus-dialog'), null);
  assert.equal(istekler.filter(i => i.yontem === 'POST').length, 0);
  await ctx.close();
});

test('teklif: önizleme + onayla, sıradaki numara, Taslak, plan özeti notta, Bearer ile', async () => {
  const {ctx, sayfa, hatalar, istekler} = await sayfaAc({sso: true});
  await sayfa.click('#pusulaAktar');
  await sayfa.waitForSelector('#akOzet');
  assert.match(await sayfa.textContent('#akOzet'), /Net kullanım alanı: 87,18 m²/);
  // Zorunlu alan boşken istek gitmez
  await sayfa.click('.tarus-dialog-footer .birincil');
  assert.match(await sayfa.textContent('[data-h="musteri"]'), /zorunlu/);
  assert.equal(istekler.filter(i => i.yontem === 'POST' && i.yol === '/teklifler/').length, 0);

  await sayfa.fill('input[data-k="musteri"]', 'Ayşe Yılmaz');
  await sayfa.fill('input[data-k="ilce"]', 'Atakum');
  await sayfa.click('.tarus-dialog-footer .birincil');
  await sayfa.waitForSelector('.sonuc');
  const post = istekler.find(i => i.yontem === 'POST' && i.yol === '/teklifler/');
  const g = JSON.parse(post.govde);
  assert.equal(post.yetki, `Bearer ${JWT}`);
  assert.match(g.no, /^TKL-\d{4}-012$/);
  assert.equal(g.musteri, 'Ayşe Yılmaz');
  assert.equal(g.ilce, 'Atakum');
  assert.equal(g.durum, 'Taslak');
  assert.equal(g.insaat_alani, 87.18);
  assert.match(g.notlar, /Mobilya ve donatı/);
  assert.match(await sayfa.textContent('.sonuc'), /TKL-\d{4}-012/);
  assert.deepEqual(hatalar, []);
  await ctx.close();
});

test('teklif hatası: Pusula 400 dönerse pencere açık kalır, hata bildirilir', async () => {
  const {ctx, sayfa} = await sayfaAc({sso: true, teklifHata: true});
  await sayfa.click('#pusulaAktar');
  await sayfa.fill('input[data-k="musteri"]', 'X');
  await sayfa.click('.tarus-dialog-footer .birincil');
  await sayfa.waitForSelector('.tarus-toast.hata');
  assert.match(await sayfa.textContent('.tarus-toast.hata'), /musteri: Bu alan boş bırakılamaz/);
  assert.ok(await sayfa.$('#akOzet'));
  await ctx.close();
});

test('yeni proje: Tasarım kategorisi, plan görseli ve dosyası Arkiv belgelerine yüklenir', async () => {
  const {ctx, sayfa, hatalar, istekler} = await sayfaAc({sso: true});
  await sayfa.click('#pusulaAktar');
  await sayfa.click('#akTur [data-t="proje"]');
  await sayfa.fill('input[data-k="malik"]', 'Mehmet Demir');
  await sayfa.click('.tarus-dialog-footer .birincil');
  await sayfa.waitForSelector('.sonuc', {timeout: 15000});
  const g = JSON.parse(istekler.find(i => i.yontem === 'POST' && i.yol === '/projects/').govde);
  assert.equal(g.category, 'Tasarım');
  assert.equal(g.malik, 'Mehmet Demir');
  assert.equal(g.il, 'Samsun');
  assert.equal(g.kategori_alanlari.kaynak, 'tarus Tasarla');
  const belgeler = istekler.filter(i => i.yol === '/arkiv/projects/p-yeni/documents/');
  assert.equal(belgeler.length, 2);
  assert.ok(belgeler.some(b => b.govde.includes('tasarla_gorsel')) && belgeler.some(b => b.govde.includes('tasarla_plan')));
  assert.match(await sayfa.textContent('.sonuc'), /PRJ-2026-031/);
  assert.deepEqual(hatalar, []);
  await ctx.close();
});

test('mevcut projeye ekle: proje seçilir, yalnız Arkiv yüklemesi yapılır', async () => {
  const {ctx, sayfa, istekler} = await sayfaAc({sso: true});
  await sayfa.click('#pusulaAktar');
  await sayfa.click('#akTur [data-t="mevcut"]');
  await sayfa.click('.proje-satir[data-id="p-mevcut"]');
  await sayfa.click('.tarus-dialog-footer .birincil');
  await sayfa.waitForSelector('.sonuc', {timeout: 15000});
  assert.equal(istekler.filter(i => i.yontem === 'POST' && i.yol === '/projects/').length, 0);
  assert.equal(istekler.filter(i => i.yol === '/arkiv/projects/p-mevcut/documents/').length, 2);
  await ctx.close();
});
