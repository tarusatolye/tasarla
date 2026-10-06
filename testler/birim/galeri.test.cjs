// Galeri: paylaşılan planın temizlenmesi ve kayıt gövdesi (tarayıcısız)
const test = require('node:test');
const assert = require('node:assert/strict');
const {planTemizle, kayitGovdesi, paylasimAdresi, etiketAyir, galeriSorgusu} = require('../../js/galeri.js');

const ORTAM = {MATS: {parke: {}, seramik: {}}, WALLS: [[0, 0, 1, 1], [0, 0, 1, 1]], varsayilanMalzeme: () => 'parke'};

test('bilinmeyen malzeme varsayılana, olmayan duvar ve bozuk ölçü atılır', () => {
  const p = planTemizle({
    furniture: [{id: 'a', type: 'bed', name: 'Yatak', cx: 1, cy: 2, w: 10, d: 20, rot: 90, color: '#ABCDEF'}],
    rooms: {salon: {name: 'Salon', mat: 'altin'}, mutfak: {name: 'Mutfak', mat: 'seramik'}},
    demolished: ['w1', 'w9', 'x1'],
    measures: [{a: {x: 0, y: 0}, b: {x: 5, y: 0}}, {a: {x: 'x'}, b: {}}],
  }, ORTAM);
  assert.equal(p.rooms.salon.mat, 'parke');
  assert.equal(p.rooms.mutfak.mat, 'seramik');
  assert.deepEqual(p.demolished, ['w1']);
  assert.equal(p.measures.length, 1);
  assert.equal(p.furniture[0].color, '#ABCDEF');
});

test('mobilyada geçersiz renk ve sayı ayıklanır, fazladan alan taşınmaz', () => {
  const p = planTemizle({furniture: [
    {id: 'a', type: 'bed', name: 'A', cx: 1, cy: 2, w: 10, d: 20, color: 'red" onload="x', ekstra: 1},
    {id: 'b', type: 'bed', name: 'B', cx: NaN, cy: 2, w: 10, d: 20, color: '#000000'},
    {id: 'c', type: 'bed', name: 'C', cx: 1, cy: 2, w: 0, d: 20, color: '#000000'},
  ]}, ORTAM);
  assert.equal(p.furniture.length, 1);
  assert.equal(p.furniture[0].color, '#c8c2b6');
  assert.equal(p.furniture[0].rot, 0);
  assert.ok(!('ekstra' in p.furniture[0]));
});

test('boş ya da bozuk girdi boş plan verir', () => {
  assert.deepEqual(planTemizle(null, ORTAM), {furniture: [], rooms: {}, demolished: [], measures: []});
});

test('kayıt gövdesi: metinler kırpılır, yalnız plan alanları gider', () => {
  const state = {furniture: [], rooms: {}, demolished: [], measures: [], gecici: 1};
  const g = kayitGovdesi(state, {baslik: '  Salon  ', yazar_adi: ' Ayşe ', aciklama: 'x'.repeat(600), sablon: 1}, 'data:,', 'abc');
  assert.equal(g.baslik, 'Salon');
  assert.equal(g.yazar_adi, 'Ayşe');
  assert.equal(g.aciklama.length, 500);
  assert.equal(g.sablon, true);
  assert.ok(!('galeride' in g), 'bütün tasarımlar herkese açık: galeride seçeneği gitmemeli');
  assert.deepEqual(Object.keys(g.plan), ['furniture', 'rooms', 'demolished', 'measures']);
  assert.equal(g.kaynak, 'abc');
});

test('paylaşım adresi sorgu parametresiyle (göreli js yolları /t/ altında kırılmasın)', () => {
  assert.equal(paylasimAdresi('ab cd', 'https://tasarla.tarus.tr'), 'https://tasarla.tarus.tr/?t=ab%20cd');
});

test('etiketler: Türkçe küçük harf, # ve fazla boşluk atılır, tekil, en çok 5', () => {
  assert.deepEqual(etiketAyir(' Salon, #İskandinav ,salon,  Işıklı   Mutfak ,,'), ['salon', 'iskandinav', 'ışıklı mutfak']);
  assert.deepEqual(etiketAyir('a,b,c,d,e,f,g'), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(etiketAyir('x'.repeat(40))[0].length, 24);
  assert.deepEqual(etiketAyir(''), []);
  assert.deepEqual(etiketAyir(undefined), []);
  const g = kayitGovdesi({furniture: [], rooms: {}, demolished: [], measures: []}, {baslik: 'A', etiketler: 'Banyo, küçük ev'}, '', '');
  assert.deepEqual(g.etiketler, ['banyo', 'küçük ev']);
});

test('galeri sorgusu: boş arama ve tümü gönderilmez, metin kodlanır', () => {
  assert.equal(galeriSorgusu({}), '/galeri/?sira=yeni&sayfa=1');
  assert.equal(galeriSorgusu({tur: 'sablon', sira: 'begeni', sayfa: 2, q: '  ferah   salon ', etiket: 'küçük ev'}),
    '/galeri/?sira=begeni&tur=sablon&q=ferah+salon&etiket=k%C3%BC%C3%A7%C3%BCk+ev&sayfa=2');
  assert.equal(galeriSorgusu({q: 'a&tur=inceleme'}), '/galeri/?sira=yeni&q=a%26tur%3Dinceleme&sayfa=1');
  assert.equal(new URLSearchParams(galeriSorgusu({q: 'x'.repeat(200)}).split('?')[1]).get('q').length, 80);
});

// Bağlantı önizlemesi: nginx SSI index.html'deki bu bloğu işler (deploy/nginx.conf).
test('index.html: Open Graph SSI bloğu ve varsayılan kart', () => {
  const fs = require('node:fs'), path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const bas = html.slice(0, html.indexOf('</head>'));
  assert.match(bas, /<!--# if expr="\$arg_t" -->\s*<!--# include virtual="\/_paylasim-meta\?t=\$arg_t" -->\s*<!--# else -->/);
  const varsayilan = bas.slice(bas.indexOf('<!--# else -->'), bas.indexOf('<!--# endif -->'));
  for (const ozellik of ['og:title', 'og:description', 'og:image', 'og:url']) assert.ok(varsayilan.includes(`property="${ozellik}"`), ozellik);
  assert.match(varsayilan, /og:image" content="https:\/\/tasarla\.tarus\.tr\/public\/icon-512\.png"/);
  const conf = fs.readFileSync(path.join(__dirname, '../../deploy/nginx.conf'), 'utf8');
  assert.match(conf, /location = \/_paylasim-meta \{\s*internal;/);
  assert.match(conf, /ssi on;/);
});
