/* tarus Tasarla — sürüm bilgisi (tek kaynak). Ayrıntılı geçmiş:
 * ozluk/surum-notlari/surum-notlari-tasarla.md. Uygulama içi not en çok 3 cümle.
 * 2026-10-04: numaralar 0.0.1'den yeniden düzenlendi (1.0.0-1.0.2 -> 0.0.1-0.0.3). */
(function (kok) {
  const APP_VERSION = '0.1.3';
  const ILK_YAYIN = '2 Ekim 2026';
  const SURUM_NOTLARI = [
    {surum: '0.1.3', tarih: '6 Ekim 2026',
      not: 'Hakkında\'daki geliştirici alanında tarus işareti ve adı yer alıyor; işaret açık ve koyu temada yazı rengini alıyor.'},
    {surum: '0.1.2', tarih: '6 Ekim 2026',
      not: 'Tasarım penceresinde beğeni sayısı kalp simgesinin yanında görünüyor; önceden alt satıra düşüyordu. Hakkında\'daki tarus Yazılım bağlantısı tarus.tr adresini açıyor.'},
    {surum: '0.1.1', tarih: '6 Ekim 2026',
      not: 'Galeri artık ayrı bir pencere değil, Hızlı Bakış sayfası; Tasarla bu sayfayla açılıyor. Bir tasarım ya da şablon açınca çizime geçilir, üst çubuktaki «Çizime dön» / «Hızlı Bakış» düğmesiyle iki görünüm arasında gidip gelebilirsiniz.'},
    {surum: '0.1.0', tarih: '6 Ekim 2026',
      not: 'Tasarımınızı hesap açmadan kaydedip bağlantıyla paylaşabilir, isterseniz şablon olarak ekleyebilirsiniz; bütün tasarımlar Galeri\'de herkese açıktır. Galeri\'de tasarımları açıp beğenebilir, bir şablonla yeni tasarıma başlayabilirsiniz. Tasarımınızı kaydettiğiniz tarayıcıdan güncelleyebilirsiniz; kaldırma yalnız yöneticidedir.'},
    {surum: '0.0.10', tarih: '5 Ekim 2026',
      not: 'Bildirimler ve pencereler ortak tarus katman sırasını kullanıyor. Pusula bağlantısı açıkken Hata bildir, oturum süresi dolmuşsa bir kez yenileyip yeniden gönderiyor.'},
    {surum: '0.0.9', tarih: '4 Ekim 2026',
      not: 'Tema renkleri ve araç çubuğu ortak tarus kabuğunun son sürümüyle eşitlendi.'},
    {surum: '0.0.8', tarih: '4 Ekim 2026',
      not: 'İlk açılışta varsayılan tema artık Modern Işık; daha önce seçtiğiniz tema korunur. Uygulama bilgisi dosyası tarayıcılara doğru türde sunuluyor.'},
    {surum: '0.0.7', tarih: '4 Ekim 2026',
      not: 'Tasarla artık giriş istemiyor: herkes doğrudan kullanabilir, plan yalnız tarayıcıda saklanır. 3B sahne dış bağlantıya ihtiyaç duymadan açılıyor. Pusula bağlantısı tarus çalışanları için kullanıcı menüsünde isteğe bağlı.'},
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
