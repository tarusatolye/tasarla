// Türkçeleştirme (YH7): yayımlanan dosyalarda Çince metin kalmamalı, arayüz metinlerinde uzun tire olmamalı
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const kok = path.join(__dirname, '../..');
const DOSYALAR = ['index.html', 'README.md', 'manifest.webmanifest', ...['js', 'styles'].flatMap(d => fs.readdirSync(path.join(kok, d)).map(f => `${d}/${f}`))];
const CJK = /[　-〿一-鿿＀-￯]/;

test('yayımlanan dosyalarda Çince karakter yok', () => {
  for (const f of DOSYALAR){
    const satirlar = fs.readFileSync(path.join(kok, f), 'utf8').split('\n');
    satirlar.forEach((s, i) => assert.ok(!CJK.test(s), `${f}:${i + 1}: ${s.trim().slice(0, 80)}`));
  }
});

test('index.html Türkçe ve tarus başlığı taşıyor', () => {
  const html = fs.readFileSync(path.join(kok, 'index.html'), 'utf8');
  assert.match(html, /<html lang="tr">/);
  assert.match(html, /<title>tarus Tasarla<\/title>/);
  assert.ok(!/\btr\(['`]/.test(html), 'eski çift dilli tr() çağrısı kaldı');
  assert.ok(!/data-en/.test(html), 'eski data-en özniteliği kaldı');
});

test('arayüz metinlerinde uzun / orta tire yok (tarus-standartlar)', () => {
  const kod = fs.readFileSync(path.join(kok, 'index.html'), 'utf8') + fs.readFileSync(path.join(kok, 'js/kabuk.js'), 'utf8');
  // yorum satırları hariç, tırnak içindeki metinler
  const metinler = kod.split('\n').filter(s => !/^\s*(\/\/|\/?\*)/.test(s)).join('\n').match(/(['"`])(?:(?!\1)[^\\\n]|\\.)*\1/g) || [];
  const kotu = metinler.filter(m => /[—–]/.test(m));
  assert.deepEqual(kotu, []);
});
