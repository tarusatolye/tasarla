// Plan → Pusula teklif / proje dönüşümünün saf fonksiyonları (YH13)
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../js/pusula-aktar.js');

const R = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const alan = poly => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2 / 1e6;
const ROOMS = [
  {id: 'salon', name: 'Salon', poly: R(0, 0, 5000, 4000), mat: 'parke'},
  {id: 'cumba', name: 'Cumba', poly: R(0, 0, 1000, 500), mat: 'parke', counted: false},
];
const MATS = {parke: {name: 'Meşe lamine parke', price: 1000}};
const WALLS = [[0, 0, 3000, 240, 'n']];
const state = {
  rooms: {salon: {name: 'Salon', mat: 'parke'}, cumba: {name: 'Cumba', mat: 'parke'}},
  furniture: [
    {type: 'chair', name: 'Sandalye', w: 450, d: 500}, {type: 'chair', name: 'Sandalye', w: 450, d: 500},
    {type: 'sofa', name: 'Üçlü koltuk', w: 2100, d: 900},
  ],
  demolished: ['w0'], measures: [],
};

test('planOzeti: net alan sayılmayan mahalleri dışarıda bırakır, döşemeye %5 fire ekler', () => {
  const oz = A.planOzeti(state, ROOMS, MATS, alan, WALLS);
  assert.equal(oz.netAlan, 20);
  assert.equal(oz.mahaller.length, 2);
  assert.equal(oz.mahaller[1].sayilir, false);
  assert.equal(oz.dosemeToplam, Math.round(20 * 1000 * 1.05) + Math.round(0.5 * 1000 * 1.05));
  assert.equal(oz.mobilyaAdedi, 3);
  assert.equal(oz.yikilanDuvarM, 3);
});

test('planOzeti: aynı ad ve ölçüdeki mobilyalar adetle gruplanır, ölçüler cm', () => {
  const oz = A.planOzeti(state, ROOMS, MATS, alan, WALLS);
  const s = oz.mobilyalar.find(m => m.ad === 'Sandalye');
  assert.deepEqual(s, {ad: 'Sandalye', olcu: '45×50 cm', adet: 2});
});

test('sonrakiTeklifNo: Pusula ön yüzüyle aynı kural (en büyük + 1, üç hane)', () => {
  const d = new Date(2026, 9, 2);
  assert.equal(A.sonrakiTeklifNo([], d), 'TKL-2026-001');
  assert.equal(A.sonrakiTeklifNo([{no: 'TKL-2026-007'}, {no: 'TKL-2025-012'}, {no: 'ozel'}], d), 'TKL-2026-013');
});

test('gun: yerel takvim günü, UTC kayması yok', () => {
  assert.equal(A.gun(new Date(2026, 11, 31, 23, 30)), '2026-12-31');
  assert.equal(A.gun(new Date(2026, 11, 31), 1), '2027-01-01');
});

test('teklifGovdesi: Pusula teklif alanları, taslak durum, 30 gün geçerlilik, boş kalemler', () => {
  const oz = A.planOzeti(state, ROOMS, MATS, alan, WALLS);
  const g = A.teklifGovdesi(oz, {musteri: ' Ayşe Yılmaz ', konu: 'Daire tefrişi', il: 'Samsun', ilce: 'Atakum', mahalle: '', ada: '12', parsel: '3'}, 'TKL-2026-001', new Date(2026, 9, 2));
  assert.equal(g.no, 'TKL-2026-001');
  assert.equal(g.musteri, 'Ayşe Yılmaz');
  assert.equal(g.durum, 'Taslak');
  assert.equal(g.tarih, '2026-10-02');
  assert.equal(g.gecerlilik, '2026-11-01');
  assert.equal(g.insaat_alani, 20);
  assert.deepEqual(g.kalemler, {});
  assert.equal(g.kdv, 20);
  assert.match(g.notlar, /Net kullanım alanı: 20,00 m²/);
  assert.match(g.notlar, /2 × Sandalye \(45×50 cm\)/);
});

test('projeGovdesi: zorunlu alanlar dolu, kategori Tasarım, kategori_alanlari sınırlar içinde', () => {
  const oz = A.planOzeti(state, ROOMS, MATS, alan, WALLS);
  const g = A.projeGovdesi(oz, {konu: 'Daire', musteri: 'Ali', malik: '', il: 'Samsun', ilce: '', mahalle: ''});
  assert.equal(g.category, 'Tasarım');
  assert.equal(g.malik, 'Ali');            // malik boşsa müşteri
  assert.equal(g.ilce, '-');
  assert.equal(g.mahalle, '-');
  const ka = g.kategori_alanlari;
  assert.ok(Object.keys(ka).length <= 50);
  Object.values(ka).forEach(v => assert.ok(typeof v === 'number' || (typeof v === 'string' && v.length <= 200)));
});

test('formHatalari: zorunlu alanlar', () => {
  assert.deepEqual(Object.keys(A.formHatalari('teklif', {musteri: '', konu: ''})).sort(), ['konu', 'musteri']);
  assert.deepEqual(Object.keys(A.formHatalari('proje', {il: '', malik: '', musteri: ''})).sort(), ['il', 'malik']);
  assert.deepEqual(A.formHatalari('proje', {il: 'Samsun', musteri: 'Ali'}), {});
  assert.ok(A.formHatalari('mevcut', {}).projeId);
});
