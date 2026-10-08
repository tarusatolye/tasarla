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
  // localhost dışı adres (127.0.0.2): canlıdaki gibi davranır. Eskiden localhost'ta
  // "yerel mod" açıldığı için canlıdaki Pusula yönlendirmesi testte görünmüyordu.
  await new Promise(r => sunucu.listen(0, '0.0.0.0', r));
  adres = `http://127.0.0.2:${sunucu.address().port}`;
  tarayici = await tarayiciAc();
});

// Playwright'ın kendi Chromium'u kurulu değilse (`npx playwright install` yapılmamış makine)
// testler kalmasın: TASARLA_TARAYICI=msedge|chrome ile kanal seçilir; seçilmemişse kurulu
// Edge ya da Chrome'a kendiliğinden düşülür.
async function tarayiciAc(){
  const kanal = process.env.TASARLA_TARAYICI;
  if (kanal) return chromium.launch({channel: kanal});
  try { return await chromium.launch(); }
  catch (e) {
    if (!/Executable doesn't exist|browserType\.launch/.test(e.message)) throw e;
    for (const k of ['msedge', 'chrome']) {
      try { return await chromium.launch({channel: k}); } catch (_) { /* sıradaki kanal */ }
    }
    throw e;
  }
}
test.after(async () => { await tarayici?.close(); sunucu?.close(); });

/* Pusula taklidi: istekleri kaydeder, yanıtları senaryoya göre verir */
async function sayfaAc({sso = false, teklifHata = false, tema = null, api = null, adres: yol = '/index.html'} = {}){
  const ctx = await tarayici.newContext({viewport: {width: 1440, height: 900}, ignoreHTTPSErrors: true});
  if (tema) await ctx.addCookies([{name: 'tarus-theme', value: tema, url: adres}]);
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
  // "Pusula ile bağlan": yetkilendirme sayfası taklit edilir (gezinme isteği).
  await sayfa.route(`${PUSULA}/auth/sso/authorize/**`, r => { istekler.push({yontem: 'GET', yol: '/auth/sso/authorize/', ara: new URL(r.request().url()).search}); return r.fulfill({status: 200, contentType: 'text/html', body: '<title>Pusula</title>'}); });
  // Tasarla API'si (api/): verilmezse statik sunucu /api/ için 404 döner (yalnız Dockerfile yayını gibi)
  if (api) await sayfa.route(`${adres}/api/**`, api);
  await sayfa.goto(`${adres}${yol}${sso ? '?sso_code=tek-kullanimlik' : ''}`);
  await sayfa.waitForSelector('#tarus-loader', {state: 'detached', timeout: 15000});
  return {ctx, sayfa, hatalar, istekler};
}

test('giriş istemeden açılır: misafir, Pusula\'ya istek ve yönlendirme yok, Türkçe arayüz, kütüphane', async () => {
  const {ctx, sayfa, hatalar, istekler} = await sayfaAc();
  assert.equal(new URL(sayfa.url()).host, new URL(adres).host, 'Pusula\'ya yönlendirdi');
  assert.deepEqual(istekler, [], 'misafir açılışta Pusula\'ya istek gitti');
  assert.equal(await sayfa.title(), 'tarus Tasarla');
  assert.equal(await sayfa.getAttribute('html', 'lang'), 'tr');
  assert.equal(await sayfa.textContent('#kAd'), 'Misafir');
  assert.equal(await sayfa.isVisible('#pusulaAktar'), false, 'misafire Pusula\'ya aktar görünmemeli');
  assert.ok(await sayfa.evaluate(() => document.documentElement.classList.contains('theme-modern')), 'çerez yokken varsayılan tema Modern olmalı');
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

test('ortak tema çerezi varsayılandan önce gelir', async () => {
  const {ctx, sayfa, hatalar} = await sayfaAc({tema: 'karanlik'});
  assert.ok(await sayfa.evaluate(() => document.documentElement.classList.contains('theme-karanlik')));
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

test('misafir: "Pusula ile bağlan" yalnız istenince Pusula yetkilendirmesine gider', async () => {
  const {ctx, sayfa, istekler} = await sayfaAc();
  await sayfa.click('#kullaniciBtn');
  assert.equal(await sayfa.isVisible('#pusulaAc'), false);
  await sayfa.click('#girisBtn');
  await sayfa.waitForURL(u => u.href.startsWith('https://pusula.tarus.tr/auth/sso/authorize/'));
  const yetki = istekler.find(i => i.yol === '/auth/sso/authorize/');
  assert.ok(decodeURIComponent(yetki.ara).includes(new URL(adres).host), 'dönüş adresi Tasarla değil');
  assert.equal(istekler.filter(i => i.yontem === 'POST').length, 0);
  await ctx.close();
});

test('3B sahne: depodaki three.js ile açılır, dış CDN isteği yok', async () => {
  const {ctx, sayfa, hatalar} = await sayfaAc();
  const disIstek = [];
  sayfa.on('request', q => { if (/cdn\.jsdelivr|unpkg|cdnjs/.test(q.url())) disIstek.push(q.url()); });
  await sayfa.getByText('3B sahne').click();
  await sayfa.waitForFunction(() => [...document.querySelectorAll('canvas')].some(c => c.width > 300), null, {timeout: 15000});
  assert.match(await sayfa.textContent('body'), /Yörünge/);
  assert.deepEqual(disIstek, []);
  assert.deepEqual(hatalar, []);
  await ctx.close();
});

test('misafir hata bildirimi Pusula yerine e-posta taslağına yönlenir', async () => {
  const {ctx, sayfa, istekler} = await sayfaAc();
  await sayfa.evaluate(() => window.__tarusOpenHataBildir());
  await sayfa.waitForSelector('#fbNot');
  assert.match(await sayfa.textContent('#fbNot'), /destek@tarus\.tr/);
  assert.equal(istekler.length, 0);
  await sayfa.keyboard.press('Escape');
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

test('plan: mobilya seçilir, sürüklenir, Delete ile silinir; duvar yıkılır; tekerlek basılıyken plan kayar', async () => {
  const {ctx, sayfa, hatalar} = await sayfaAc();
  const merkez = async sec => { const k = await sayfa.locator(sec).first().boundingBox(); return [k.x + k.width/2, k.y + k.height/2]; };
  const mobilyaSayisi = () => sayfa.locator('[data-fid]').count();

  // Mobilya seç ve sürükle (2026-10-06: kaldırılmış menüye erişim her tıklamada hata atıyordu, hiçbir şey seçilemiyordu)
  const id = await sayfa.evaluate(() => [...document.querySelectorAll('[data-fid]')].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0].dataset.fid);
  const [x, y] = await merkez(`[data-fid="${id}"]`);
  await sayfa.mouse.move(x, y); await sayfa.mouse.down();
  await sayfa.mouse.move(x + 40, y + 30, {steps: 8}); await sayfa.mouse.up();
  assert.match(await sayfa.textContent('#panel'), /Mobilya/, 'tıklanan mobilya seçilmedi');
  const [x2, y2] = await merkez(`[data-fid="${id}"]`);
  assert.ok(Math.hypot(x2 - x, y2 - y) > 10, 'mobilya sürüklenince yer değiştirmedi');

  const once = await mobilyaSayisi();
  await sayfa.keyboard.press('Delete');
  assert.equal(await mobilyaSayisi(), once - 1, 'Delete seçili mobilyayı silmedi');

  // Taşıyıcı olmayan iç duvar yıkılır
  await sayfa.click('[data-tool="demolish"]');
  const duvar = await sayfa.evaluate(() => [...document.querySelectorAll('rect[data-wall]')].find(w => w.getAttribute('fill') === '#a7a195' && Math.max(w.getBoundingClientRect().width, w.getBoundingClientRect().height) > 60).dataset.wall);
  await sayfa.mouse.click(...await merkez(`[data-wall="${duvar}"]`));
  assert.equal(await sayfa.getAttribute(`[data-wall="${duvar}"]`, 'stroke-dasharray'), '5 3', 'duvar yıkılacak olarak işaretlenmedi');

  // Orta tuşla kaydırma seçili araçtan bağımsız çalışır
  const svgSec = 'svg:has([data-wall])', vb = await sayfa.getAttribute(svgSec, 'viewBox');
  const [sx, sy] = await merkez(svgSec);
  await sayfa.mouse.move(sx, sy); await sayfa.mouse.down({button: 'middle'});
  await sayfa.mouse.move(sx + 120, sy + 60, {steps: 8}); await sayfa.mouse.up({button: 'middle'});
  assert.notEqual(await sayfa.getAttribute(svgSec, 'viewBox'), vb, 'tekerlek basılıyken plan kaymadı');

  assert.deepEqual(hatalar, []);
  await ctx.close();
});

/* Hızlı Bakış (galeri sayfası) açılışta açık gelir; düğme aç/kapa yapar. Taze liste ve güncel
   yönetici durumu için açıksa kapatıp yeniden açar. */
async function hizliBakisAc(sayfa){
  if (await sayfa.isVisible('#hizliBakis')) await sayfa.click('#galeriBtn');
  await sayfa.click('#galeriBtn');
  await sayfa.waitForSelector('#hizliBakis:not([hidden])');
}

/* Tasarla API taklidi (api/galeri): istekleri kaydeder. Yönetici: Authorization ile gelen her istek. */
function apiTaklidi(){
  const istekler = [], tasarimlar = {};
  const PLAN = {furniture: [{id: 'g1', type: 'bed', name: 'Galeri yatağı', cx: 8300, cy: 1000, w: 1800, d: 2000, rot: 0, color: '#c9d6df'}],
                rooms: {}, demolished: [], measures: []};
  const ortak = {aciklama: '', onizleme: '', kopya_sayisi: 0, goruntulenme: 0, olusturma: '2026-10-06T10:00:00+03:00', guncelleme: '2026-10-06T10:00:00+03:00', plan: PLAN};
  tasarimlar.hazir1 = {...ortak, kod: 'hazir1', baslik: 'Ferah salon', yazar_adi: 'Ayşe', aciklama: 'Açık mutfak', begeni_sayisi: 4, sablon: false, etiketler: ['salon', 'iskandinav']};
  tasarimlar.sablon1 = {...ortak, kod: 'sablon1', baslik: 'Stüdyo daire şablonu', yazar_adi: 'Can', begeni_sayisi: 9, sablon: true, etiketler: ['küçük ev']};
  const isleyici = async route => {
    const req = route.request(), u = new URL(req.url()), yol = u.pathname, yontem = req.method();
    const govde = req.postData() ? JSON.parse(req.postData()) : null;
    const yetki = req.headers()['authorization'] || '';
    istekler.push({yontem, yol, ara: u.search, govde, anahtar: req.headers()['x-tasarla-anahtar'] || '', yetki});
    const json = (status, body) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
    if (yol === '/api/saglik/') return json(200, {ok: true});
    if (yol === '/api/yonetici/') return json(200, {yonetici: !!yetki});
    if (yol === '/api/galeri/' && u.searchParams.get('tur') === 'inceleme'){
      if (!yetki) return json(403, {detail: 'Yetki yok.'});
      const {plan, ...t} = tasarimlar.hazir1;
      return json(200, {sonuclar: [{...t, sikayet_sayisi: 3, galeride: false, sikayetler: {
        turler: [{tur: 'spam', etiket: 'Reklam / istenmeyen içerik', sayi: 2}, {tur: 'diger', etiket: 'Diğer', sayi: 1}],
        aciklamalar: [{tur: 'spam', neden: 'reklam bağlantısı', tarih: '2026-10-07T09:00:00+03:00'}]}}], sonraki: null, toplam: 1});
    }
    if (/^\/api\/tasarimlar\/[^/]+\/sikayet\/$/.test(yol)) return json(201, {detail: 'Bildiriminiz alındı. Teşekkürler.'});
    if (yol.startsWith('/api/moderasyon/')){
      if (!yetki) return json(403, {detail: 'Yetki yok.'});
      return json(200, {kod: yol.split('/')[3], sikayet_sayisi: 0});
    }
    if (yol === '/api/galeri/'){
      const tur = u.searchParams.get('tur'), q = (u.searchParams.get('q') || '').toLocaleLowerCase('tr-TR'), etiket = u.searchParams.get('etiket');
      const liste = Object.values(tasarimlar).filter(t => tur !== 'sablon' || t.sablon)
        .filter(t => !q || `${t.baslik} ${t.aciklama} ${(t.etiketler || []).join(' ')}`.toLocaleLowerCase('tr-TR').includes(q))
        .filter(t => !etiket || (t.etiketler || []).includes(etiket)).map(({plan, ...t}) => t);
      return json(200, {sonuclar: liste, sonraki: null, toplam: liste.length});
    }
    if (yol === '/api/etiketler/') return json(200, {etiketler: [{ad: 'salon', sayi: 1}, {ad: 'iskandinav', sayi: 1}, {ad: 'küçük ev', sayi: 1}]});
    if (yol === '/api/tasarimlar/' && yontem === 'POST'){
      const t = {...govde, kod: 'yeni42', begeni_sayisi: 0, kopya_sayisi: 0, goruntulenme: 0, onizleme: '/api/medya/onizleme/yeni42.webp', olusturma: '2026-10-06T11:00:00+03:00', guncelleme: '2026-10-06T11:00:00+03:00'};
      tasarimlar.yeni42 = t;
      return json(201, {...t, anahtar: 'gizli-anahtar'});
    }
    const m = yol.match(/^\/api\/tasarimlar\/([^/]+)\/(begen\/)?$/);
    if (m && m[2]) return json(200, {begeni_sayisi: ++tasarimlar[m[1]].begeni_sayisi});
    if (m && yontem === 'GET') return tasarimlar[m[1]] ? json(200, {...tasarimlar[m[1]], kaynak: '', sahibi: m[1] === 'yeni42'}) : json(404, {detail: 'yok'});
    if (m && yontem === 'PUT') return json(200, {...tasarimlar[m[1]], ...govde});
    if (m && yontem === 'DELETE'){
      if (!yetki) return json(403, {detail: 'Tasarımları yalnız yönetici silebilir.'});
      delete tasarimlar[m[1]]; return route.fulfill({status: 204});
    }
    return json(404, {detail: 'yok'});
  };
  return {isleyici, istekler, tasarimlar};
}

test('galeri: API yokken Paylaş ve Galeri görünmez', async () => {
  const {ctx, sayfa, hatalar} = await sayfaAc();
  await sayfa.waitForTimeout(500);
  assert.equal(await sayfa.isVisible('#paylasBtn'), false);
  assert.equal(await sayfa.isVisible('#galeriBtn'), false);
  assert.equal(await sayfa.isVisible('#hizliBakis'), false, 'API yokken Hızlı Bakış açılmamalı');
  assert.deepEqual(hatalar.filter(h => !/404/.test(h)), []);
  await ctx.close();
});

test('galeri: paylaş → kayıt (herkese açık, şablon seçeneği), anahtar tarayıcıda; ikinci paylaşım günceller', async () => {
  const api = apiTaklidi();
  const {ctx, sayfa, hatalar} = await sayfaAc({api: api.isleyici});
  await sayfa.click('#paylasBtn');
  assert.equal(await sayfa.locator('#gGaleride').count(), 0, 'galeride seçeneği kalkmalı: bütün tasarımlar açık');
  await sayfa.fill('#gBaslik', 'Benim salonum');
  await sayfa.fill('#gYazar', 'Mehmet');
  await sayfa.check('#gSablon');
  await sayfa.click('.tarus-dialog-footer .birincil');
  await sayfa.waitForSelector('#gAdres');
  assert.match(await sayfa.inputValue('#gAdres'), /\/\?t=yeni42$/);
  const kayit = api.istekler.find(i => i.yontem === 'POST' && i.yol === '/api/tasarimlar/');
  assert.equal(kayit.govde.baslik, 'Benim salonum');
  assert.equal(kayit.govde.yazar_adi, 'Mehmet');
  assert.equal(kayit.govde.sablon, true);
  assert.ok(!('galeride' in kayit.govde));
  assert.ok(kayit.govde.plan.furniture.length > 10, 'plan gitmedi');
  assert.match(kayit.govde.onizleme, /^data:image\/(webp|png);base64,/);
  const saklanan = await sayfa.evaluate(() => JSON.parse(localStorage.getItem('tasarla-tasarimlarim')));
  assert.equal(saklanan.yeni42.anahtar, 'gizli-anahtar');
  assert.match(await sayfa.textContent('#subtitle'), /^Benim salonum/);
  await sayfa.click('.tarus-dialog-footer .birincil');            // Tamam

  await sayfa.click('#paylasBtn');
  assert.equal(await sayfa.isChecked('#gSablon'), true);
  assert.equal((await sayfa.textContent('.tarus-dialog-footer .birincil')).trim(), 'Güncelle');
  await sayfa.click('.tarus-dialog-footer .birincil');
  await sayfa.waitForSelector('#gAdres');
  const guncelle = api.istekler.find(i => i.yontem === 'PUT');
  assert.equal(guncelle.yol, '/api/tasarimlar/yeni42/');
  assert.equal(guncelle.anahtar, 'gizli-anahtar');
  await sayfa.click('.tarus-dialog-footer .birincil');

  // Kendi tasarımı da olsa kullanıcı silemez: kartta Sil yok, Pusula belirteci gönderilmez
  await hizliBakisAc(sayfa);
  await sayfa.waitForSelector('.galeri-kart[data-kod="yeni42"]');
  assert.equal(await sayfa.locator('.galeri-kart [data-sil]').count(), 0);
  assert.ok(api.istekler.every(i => !i.yetki), 'misafir istekte Authorization olmamalı');
  assert.deepEqual(hatalar, []);
  await ctx.close();
});

test('galeri: arama kutusu (gecikmeli, sunucuda) ve etiket süzgeci; paylaşırken etiket', async () => {
  const api = apiTaklidi();
  const {ctx, sayfa, hatalar} = await sayfaAc({api: api.isleyici});
  await sayfa.waitForSelector('#hizliBakis:not([hidden]) .galeri-kart[data-kod="hazir1"]');
  await sayfa.waitForSelector('#galeriEtiketler:not([hidden]) [data-etiket-sec="salon"]');
  const galeriIstekleri = () => api.istekler.filter(i => i.yol === '/api/galeri/');
  const once = galeriIstekleri().length;
  await sayfa.type('#galeriAra', 'stüdyo', {delay: 30});
  await sayfa.waitForFunction(() => document.querySelectorAll('.galeri-kart').length === 1 && document.querySelector('.galeri-kart[data-kod="sablon1"]'));
  assert.equal(galeriIstekleri().length - once, 1, 'yazarken her tuşta istek gitmemeli');
  assert.equal(new URLSearchParams(galeriIstekleri().at(-1).ara).get('q'), 'stüdyo');
  await sayfa.fill('#galeriAra', 'yok böyle');
  await sayfa.waitForSelector('.galeri-bos:text("Aramanızla eşleşen tasarım yok.")');
  await sayfa.click('#galeriAraTemizle');
  await sayfa.waitForFunction(() => document.querySelectorAll('.galeri-kart').length === 2);
  // Etiket düğmesi süzer, ikinci basış kaldırır; karttaki etiket de süzer
  await sayfa.click('#galeriEtiketler [data-etiket-sec="küçük ev"]');
  await sayfa.waitForFunction(() => document.querySelectorAll('.galeri-kart').length === 1);
  assert.equal(new URLSearchParams(galeriIstekleri().at(-1).ara).get('etiket'), 'küçük ev');
  assert.equal(await sayfa.getAttribute('#galeriEtiketler [data-etiket-sec="küçük ev"]', 'aria-pressed'), 'true');
  await sayfa.click('#galeriEtiketler [data-etiket-sec="küçük ev"]');
  await sayfa.waitForFunction(() => document.querySelectorAll('.galeri-kart').length === 2);
  await sayfa.click('.galeri-kart[data-kod="hazir1"] [data-etiket-sec="iskandinav"]');
  await sayfa.waitForFunction(() => document.querySelectorAll('.galeri-kart').length === 1 && document.querySelector('.galeri-kart[data-kod="hazir1"]'));
  // Paylaş: etiketler gövdede, temizlenmiş
  await sayfa.click('#galeriBtn');   // Hızlı Bakış'ta tek «Çizime dön» üst çubukta (0.1.8)
  await sayfa.click('#paylasBtn');
  await sayfa.fill('#gBaslik', 'Etiketli');
  await sayfa.fill('#gEtiketler', ' Salon, #Işıklı Mutfak, salon');
  await sayfa.click('.tarus-dialog-footer .birincil');
  await sayfa.waitForSelector('#gAdres');
  const kayit = api.istekler.find(i => i.yontem === 'POST' && i.yol === '/api/tasarimlar/');
  assert.deepEqual(kayit.govde.etiketler, ['salon', 'ışıklı mutfak']);
  await sayfa.click('.tarus-dialog-footer .birincil');
  await sayfa.click('#paylasBtn');
  assert.equal(await sayfa.inputValue('#gEtiketler'), 'salon, ışıklı mutfak');
  assert.deepEqual(hatalar, []);
  await ctx.close();
});

test('hızlı bakış: açılış ekranı galeri sayfası; Çizime dön ve düğmeyle geçiş; ?t= bağlantısı doğrudan çizime', async () => {
  const api = apiTaklidi();
  const {ctx, sayfa, hatalar} = await sayfaAc({api: api.isleyici});
  await sayfa.waitForSelector('#hizliBakis:not([hidden]) .galeri-kart[data-kod="hazir1"]');
  assert.equal(await sayfa.locator('.tarus-dialog').count(), 0, 'galeri pencere değil sayfa olmalı');
  assert.equal((await sayfa.textContent('#hizliBakis h1')).trim(), 'Hızlı Bakış');
  assert.equal((await sayfa.textContent('#galeriBtn')).trim(), 'Çizime dön');
  assert.equal(await sayfa.isVisible('main#stage'), false, 'çizim alanı Hızlı Bakış altında görünmemeli');
  await sayfa.click('#galeriBtn');   // Hızlı Bakış'ta tek «Çizime dön» üst çubukta (0.1.8)
  assert.equal(await sayfa.isVisible('#hizliBakis'), false);
  assert.equal(await sayfa.isVisible('main#stage'), true);
  assert.equal((await sayfa.textContent('#galeriBtn')).trim(), 'Hızlı Bakış');
  await sayfa.click('#galeriBtn');
  await sayfa.waitForSelector('#hizliBakis:not([hidden])');
  await sayfa.click('#galeriBtn');
  assert.equal(await sayfa.isVisible('#hizliBakis'), false, 'düğme ikinci basışta çizime dönmeli');
  const ikinci = await sayfaAc({api: api.isleyici, adres: '/index.html?t=hazir1'});
  await ikinci.sayfa.waitForSelector('.tarus-dialog h2:text("Ferah salon")');
  assert.equal(await ikinci.sayfa.isVisible('#hizliBakis'), false, 'bağlantıyla açılışta Hızlı Bakış açılmamalı');
  await ikinci.ctx.close();
  assert.deepEqual(hatalar, []);
  await ctx.close();
});

test('galeri: listeden beğen ve aç; bağlantıyla açılan plan yüklenir, Geri al önceki plana döner', async () => {
  const api = apiTaklidi();
  const {ctx, sayfa, hatalar} = await sayfaAc({api: api.isleyici});
  const onceki = await sayfa.locator('[data-fid]').count();
  await hizliBakisAc(sayfa);
  await sayfa.waitForSelector('.galeri-kart[data-kod="hazir1"]');
  await sayfa.click('.galeri-kart[data-kod="hazir1"] [data-begen]');
  await sayfa.waitForFunction(() => document.querySelector('.galeri-kart[data-kod="hazir1"] [data-begen] span').textContent === '5');
  await sayfa.click('.galeri-kart[data-kod="hazir1"] .galeri-eylem [data-ac]');
  await sayfa.click('.tarus-dialog-footer .birincil');            // Planı aç
  await sayfa.waitForFunction(() => document.querySelectorAll('[data-fid]').length === 1);
  assert.match(await sayfa.textContent('#subtitle'), /^Ferah salon/);
  assert.equal(await sayfa.isVisible('#hizliBakis'), false, 'tasarım açılınca Hızlı Bakış kapanmalı');
  await sayfa.keyboard.press('Control+z');
  assert.equal(await sayfa.locator('[data-fid]').count(), onceki, 'Geri al önceki plana dönmedi');

  // ?t= bağlantısıyla açılış; adres temizlenir
  const ikinci = await sayfaAc({api: api.isleyici, adres: '/index.html?t=hazir1'});
  await ikinci.sayfa.waitForSelector('.tarus-dialog h2:text("Ferah salon")');
  assert.ok(!ikinci.sayfa.url().includes('t=hazir1'), 'adreste kod kaldı');
  await ikinci.ctx.close();
  assert.deepEqual(hatalar, []);
  await ctx.close();
});

test('galeri: şablonlar sekmesi; şablonla başlanan plan paylaşılınca yeni tasarım (kaynak = şablon)', async () => {
  const api = apiTaklidi();
  const {ctx, sayfa, hatalar} = await sayfaAc({api: api.isleyici});
  await hizliBakisAc(sayfa);
  await sayfa.click('[data-tur="sablon"]');
  await sayfa.waitForFunction(() => [...document.querySelectorAll('.galeri-kart')].map(k => k.dataset.kod).join() === 'sablon1');
  assert.equal((await sayfa.textContent('.galeri-kart [data-ac].birincil')).trim(), 'Kullan');
  assert.equal(await sayfa.locator('.galeri-kart .galeri-rozet').count(), 1);
  await sayfa.click('.galeri-kart .galeri-eylem [data-ac]');
  assert.equal((await sayfa.textContent('.tarus-dialog-footer .birincil')).trim(), 'Bu şablonla başla');
  await sayfa.click('.tarus-dialog-footer .birincil');
  await sayfa.waitForFunction(() => document.querySelectorAll('[data-fid]').length === 1);
  assert.match(await sayfa.textContent('#subtitle'), /Stüdyo daire şablonu» şablonundan/);

  await sayfa.click('#paylasBtn');
  assert.equal(await sayfa.inputValue('#gBaslik'), '', 'şablondan başlanınca başlık boş gelmeli');
  await sayfa.fill('#gBaslik', 'Benim stüdyom');
  await sayfa.click('.tarus-dialog-footer .birincil');
  await sayfa.waitForSelector('#gAdres');
  const kayit = api.istekler.find(i => i.yontem === 'POST' && i.yol === '/api/tasarimlar/');
  assert.equal(kayit.govde.kaynak, 'sablon1');
  assert.equal(api.istekler.filter(i => i.yontem === 'PUT').length, 0);
  assert.deepEqual(hatalar, []);
  await ctx.close();
});

test('galeri: yönetici (Pusula bağlı) Sil ve Gizle görür, istekler Pusula belirteciyle gider', async () => {
  const api = apiTaklidi();
  const {ctx, sayfa, hatalar} = await sayfaAc({sso: true, api: api.isleyici});
  await sayfa.waitForFunction(() => document.querySelector('#kAd').textContent === 'Emre Yıldırım');
  await hizliBakisAc(sayfa);
  await sayfa.waitForSelector('.galeri-kart[data-kod="hazir1"] [data-sil]');
  assert.equal(await sayfa.locator('[data-tur="inceleme"]').count(), 1, 'yöneticiye İnceleme sekmesi');
  await sayfa.click('.galeri-kart[data-kod="hazir1"] [data-sil]');
  await sayfa.click('.tarus-dialog-footer .tehlike');             // onay: Sil
  await sayfa.waitForSelector('.galeri-kart[data-kod="hazir1"]', {state: 'detached'});
  const sil = api.istekler.find(i => i.yontem === 'DELETE');
  assert.equal(sil.yol, '/api/tasarimlar/hazir1/');
  assert.equal(sil.yetki, `Bearer ${JWT}`);
  assert.deepEqual(hatalar, []);
  await ctx.close();
});

test('galeri: ziyaretçi şikâyette neden türü seçer, açıklama isteğe bağlı', async () => {
  const api = apiTaklidi();
  const {ctx, sayfa, hatalar} = await sayfaAc({api: api.isleyici});
  await hizliBakisAc(sayfa);
  await sayfa.click('.galeri-kart[data-kod="hazir1"] [data-sikayet]');
  await sayfa.waitForSelector('[data-sikayet-tur="uygunsuz"].is-active');
  await sayfa.click('[data-sikayet-tur="telif"]');
  assert.equal(await sayfa.getAttribute('[data-sikayet-tur="telif"]', 'aria-checked'), 'true');
  assert.equal(await sayfa.locator('[data-sikayet-tur].is-active').count(), 1);
  await sayfa.fill('#gNeden', 'Benim planım');
  await sayfa.click('.tarus-dialog-footer .tehlike');
  await sayfa.waitForFunction(() => document.body.textContent.includes('Bildiriminiz alındı'));
  const s = api.istekler.find(i => i.yol === '/api/tasarimlar/hazir1/sikayet/');
  assert.deepEqual(s.govde, {tur: 'telif', neden: 'Benim planım'});
  assert.deepEqual(hatalar, []);
  await ctx.close();
});

test('galeri: yönetici İnceleme sekmesinde şikâyet nedenlerini görür ve yok sayar', async () => {
  const api = apiTaklidi();
  const {ctx, sayfa, hatalar} = await sayfaAc({sso: true, api: api.isleyici});
  await sayfa.waitForFunction(() => document.querySelector('#kAd').textContent === 'Emre Yıldırım');
  await hizliBakisAc(sayfa);
  await sayfa.click('[data-tur="inceleme"]');
  await sayfa.waitForSelector('.galeri-kart[data-kod="hazir1"] .galeri-sikayet');
  const ozet = await sayfa.textContent('.galeri-kart[data-kod="hazir1"] .galeri-sikayet');
  assert.match(ozet, /Galeriden düştü · Reklam \/ istenmeyen içerik 2 · Diğer 1/);
  assert.match(ozet, /«reklam bağlantısı»/);
  await sayfa.click('.galeri-kart[data-kod="hazir1"] [data-yoksay]');
  await sayfa.click('.tarus-dialog-footer .birincil');            // onay: Yok say
  await sayfa.waitForSelector('.galeri-kart[data-kod="hazir1"]', {state: 'detached'});
  const mod = api.istekler.find(i => i.yol === '/api/moderasyon/hazir1/');
  assert.deepEqual(mod.govde, {sikayetleri_temizle: true, galeride: true});
  assert.equal(mod.yetki, `Bearer ${JWT}`);
  assert.deepEqual(hatalar, []);
  await ctx.close();
});

test('galeri: /api/ index.html ile 200 dönse de (API olmayan nginx) düğmeler gizli kalır', async () => {
  const {ctx, sayfa} = await sayfaAc({api: r => r.fulfill({status: 200, contentType: 'text/html', body: '<!doctype html><title>tarus Tasarla</title>'})});
  await sayfa.waitForTimeout(500);
  assert.equal(await sayfa.isVisible('#paylasBtn'), false);
  await ctx.close();
});
