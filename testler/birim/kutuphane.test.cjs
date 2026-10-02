// Tefriş kütüphanesi (YH11): ölçüler, türler, Türkçe adlar
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {KUTUPHANE} = require('../../js/kutuphane.js');

const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const bolum = (bas, son) => html.slice(html.indexOf(bas), html.indexOf(son, html.indexOf(bas)));
const turler = metin => new Set([...metin.matchAll(/case '([a-z0-9]+)'/g)].map(m => m[1]));
const sembol2B = turler(bolum('function furnSVG(', '\n}\n'));
const model3B = turler(bolum('function buildFurniture(', '\n}\n'));
const kalemler = KUTUPHANE.flatMap(k => k.items);

test('her kalemin 2B plan sembolü ve 3B modeli var', () => {
  for (const [tur, ad] of kalemler){
    assert.ok(sembol2B.has(tur), `${ad}: 2B sembol yok (${tur})`);
    assert.ok(model3B.has(tur), `${ad}: 3B model yok (${tur})`);
  }
});

test('ölçüler mm, cm katı ve makul aralıkta', () => {
  for (const [, ad, w, d] of kalemler){
    assert.ok(Number.isInteger(w) && Number.isInteger(d), ad);
    assert.equal(w % 10, 0, `${ad}: genişlik cm katı değil`);
    assert.ok(w >= 300 && w <= 3000 && d >= 50 && d <= 2500, `${ad}: ${w}×${d} mm aralık dışı`);
  }
});

test('Türkiye pratiği ölçüleri', () => {
  const bul = ad => kalemler.find(k => k[1] === ad);
  assert.deepEqual(bul('Çift kişilik yatak 160×200').slice(2, 4), [1600, 2000]);
  assert.deepEqual(bul('Alt dolap + tezgâh 60').slice(2, 4), [600, 600]);     // tezgâh derinliği 60 cm
  assert.equal(bul('Üst dolap 60')[3], 350);                                   // üst dolap derinliği 35 cm
  assert.deepEqual(bul('Duşakabin 90×90').slice(2, 4), [900, 900]);
  assert.deepEqual(bul('Çamaşır makinesi').slice(2, 4), [600, 600]);
  assert.ok(bul('Kombi') && bul('Panel radyatör 100') && bul('Hela taşı (alaturka)'));
});

test('adlar benzersiz ve Türkçe, kategori boş değil', () => {
  const adlar = kalemler.map(k => k[1]);
  assert.equal(new Set(adlar).size, adlar.length, 'yinelenen ad');
  KUTUPHANE.forEach(k => assert.ok(k.items.length, k.cat));
  assert.ok(!/[一-鿿]/.test(JSON.stringify(KUTUPHANE)));
});
