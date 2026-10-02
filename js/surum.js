/* tarus Tasarla — sürüm bilgisi (tek kaynak). Ayrıntılı geçmiş:
 * ozluk/surum-notlari/surum-notlari-tasarla.md. Uygulama içi not en çok 3 cümle. */
(function (kok) {
  const APP_VERSION = '1.0.0';
  const ILK_YAYIN = '2 Ekim 2026';
  const SURUM_NOTLARI = [
    {surum: '1.0.0', tarih: '2 Ekim 2026',
      not: 'Tasarla tarus ekosistemine katıldı: arayüz tamamen Türkçe, ölçüler cm ve m², tarus temaları geçerli. Mobilya kütüphanesi Türkiye\'de yaygın ölçülerle yenilendi; kombi, panel radyatör ve hela taşı eklendi. Plan, onayınızla Pusula\'da teklif ya da proje kaydına dönüştürülebilir.'},
  ];
  kok.TasarlaSurum = {APP_VERSION, ILK_YAYIN, SURUM_NOTLARI};
  if (typeof module !== 'undefined') module.exports = kok.TasarlaSurum;
})(typeof window !== 'undefined' ? window : globalThis);
