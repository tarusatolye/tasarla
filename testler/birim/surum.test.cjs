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
