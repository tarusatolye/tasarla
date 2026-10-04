/* tarus Tasarla — sürüm bilgisi (tek kaynak). Ayrıntılı geçmiş:
 * ozluk/surum-notlari/surum-notlari-tasarla.md. Uygulama içi not en çok 3 cümle.
 * 2026-10-04: numaralar 0.0.1'den yeniden düzenlendi (1.0.0-1.0.2 -> 0.0.1-0.0.3). */
(function (kok) {
  const APP_VERSION = '0.0.6';
  const ILK_YAYIN = '2 Ekim 2026';
  const SURUM_NOTLARI = [
    {surum: '0.0.6', tarih: '4 Ekim 2026',
      not: 'Ortak sağ tık menüsü güncellendi: kendi menüsü olan öğelerde genel menü artık üstüne açılmıyor. Tema renkleri ortak tarus dosyasıyla eşitlendi.'},
    {surum: '0.0.5', tarih: '4 Ekim 2026',
      not: 'Açılış ve yükleme ekranında artık “Oturum açılıyor” yazısı yok; yalnız tarus logosu çiziliyor.'},
    {surum: '0.0.4', tarih: '4 Ekim 2026',
      not: 'Sürüm numaraları uygulamanın kendi geçmişine göre yeniden düzenlendi: ilk yayın 0.0.1. Önceki 1.0.x numaraları gereksiz büyük bir başlangıçtı; görünüm ve özellikler değişmedi.'},
    {surum: '0.0.3', tarih: '3 Ekim 2026',
      not: 'Açık temalarda renkli düğmelerin ve zeminlerin üzerindeki yazı artık okunaklı beyaz kalıyor. Oturum hata iletileri düzeltildi.'},
    {surum: '0.0.2', tarih: '3 Ekim 2026',
      not: 'Sağ tık menüsündeki Hata bildir / Fikir öner artık açık Pusula oturumunuzla gönderiliyor; önceden oturum anahtarı menüye ulaşmadığı için bildirim kaydedilemeyebiliyordu.'},
    {surum: '0.0.1', tarih: '2 Ekim 2026',
      not: 'Tasarla tarus ekosistemine katıldı: arayüz tamamen Türkçe, ölçüler cm ve m², tarus temaları geçerli. Mobilya kütüphanesi Türkiye\'de yaygın ölçülerle yenilendi; kombi, panel radyatör ve hela taşı eklendi. Plan, onayınızla Pusula\'da teklif ya da proje kaydına dönüştürülebilir.'},
  ];
  kok.TasarlaSurum = {APP_VERSION, ILK_YAYIN, SURUM_NOTLARI};
  if (typeof module !== 'undefined') module.exports = kok.TasarlaSurum;
})(typeof window !== 'undefined' ? window : globalThis);
