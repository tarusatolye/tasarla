/* ============================================================
 *  tarus Tasarla — tefriş ve mobilya kütüphanesi (YH11)
 *
 *  Ölçüler cm olarak yazılır; uygulama içinde mm kullanılır (K() ×10 yapar).
 *  Ölçüler Türkiye'de piyasada yaygın satılan modüllere ve konut
 *  projelerinde kullanılan tefriş ölçülerine göre seçilmiştir:
 *  - Yatak: tek kişilik 90×190 / 100×200, çift kişilik 140×190, 160×200, 180×200
 *  - Mutfak: alt modül derinliği 60 cm, üst modül 35 cm, modül genişliği 60 cm katları
 *  - Islak hacim: duşakabin 80×80 / 90×90 / 80×120, küvet 170×70, asma klozet 36×54
 *  - Beyaz eşya: 60×60 çamaşır / bulaşık / kurutma, 60 cm ankastre, 70×70 buzdolabı
 *  - Isıtma: panel radyatör derinliği 10 cm, kombi 40×30
 *  Her kalem: [tür, ad, genişlik mm, derinlik mm, renk, açıklama]
 *  `tür` 2B plan sembolünü ve 3B modeli seçer (index.html → furnSVG, buildFurniture).
 * ============================================================ */
(function (kok) {
  const K = (tur, ad, g, d, renk, aciklama = '') => [tur, ad, Math.round(g * 10), Math.round(d * 10), renk, aciklama];

  const KUTUPHANE = [
    {cat: 'Yatak odası', items: [
      K('bed', 'Çift kişilik yatak 160×200', 160, 200, '#c9d6df', 'En yaygın çift kişilik ölçü; baza dahil'),
      K('bed', 'Çift kişilik yatak 180×200', 180, 200, '#d8c7dc', 'Geniş (king) ölçü'),
      K('bed', 'Çift kişilik yatak 140×190', 140, 190, '#d6c9b8', 'Dar odalar için'),
      K('bed', 'Tek kişilik yatak 100×200', 100, 200, '#e8d5b5', 'Genç odası'),
      K('bed', 'Tek kişilik yatak 90×190', 90, 190, '#e8d5b5', 'Çocuk odası'),
      K('crib', 'Bebek beşiği 60×120', 120, 60, '#efe3d0', '60×120 standart beşik yatağı'),
      K('nightstand', 'Komodin', 50, 40, '#e8dccb'),
      K('wardrobe', 'Gardırop 3 kapaklı', 135, 60, '#efe6d8', 'Kapak modülü 45 cm'),
      K('wardrobe', 'Gardırop 4 kapaklı', 180, 60, '#efe6d8'),
      K('wardrobe', 'Sürgülü gardırop', 220, 65, '#efe6d8', 'Sürme kapak payı dahil 65 cm derinlik'),
      K('dresser', 'Şifonyer', 100, 45, '#efe6d8', 'Aynalı çekmeceli dolap'),
      K('desk', 'Çalışma masası 100×55', 100, 55, '#e2cfb4', 'Çocuk / genç odası'),
      K('chair', 'Sandalye', 45, 50, '#cfc6b8'),
      K('bookshelf', 'Kitaplık', 80, 35, '#e2cfb4'),
      K('baycushion', 'Cumba minderi', 52, 180, '#e7dccd')]},
    {cat: 'Salon', items: [
      K('sofa', 'Üçlü koltuk', 210, 90, '#b7c4b0', 'Üç kişilik kanepe'),
      K('sofa', 'İkili koltuk', 160, 90, '#c3cbd6'),
      K('sofa', 'Çekyat', 200, 90, '#c9bfae', 'Açılınca yatak olan kanepe'),
      K('cornersofa', 'Köşe koltuk', 290, 190, '#b7c4b0', 'L köşe takımı'),
      K('armchair', 'Berjer', 80, 85, '#d6b99a', 'Tekli koltuk'),
      K('beanbag', 'Puf', 60, 60, '#e0b98f'),
      K('coffeetable', 'Orta sehpa', 110, 60, '#e8dccb'),
      K('sidetable', 'Zigon sehpa', 45, 45, '#d9c3a3', 'Koltuk yanı sehpa'),
      K('tvstand', 'TV ünitesi', 180, 40, '#e2cfb4'),
      K('rug', 'Halı 160×230', 230, 160, '#d9cbb8'),
      K('rug', 'Halı 200×290', 290, 200, '#d9cbb8'),
      K('floorlamp', 'Lambader', 45, 45, '#3d3a34'),
      K('plant', 'Saksı bitkisi', 50, 50, '#a9c39b'),
      K('plant', 'Büyük saksı bitkisi', 70, 70, '#9dbb8c')]},
    {cat: 'Antre', items: [
      K('shoecab', 'Ayakkabılık', 100, 35, '#efe6d8', 'Antre için sığ dolap'),
      K('shoecab', 'Portmanto dolabı', 120, 40, '#e6dccc', 'Askılı vestiyer + ayakkabılık'),
      K('cabinet', 'Vestiyer', 90, 35, '#efe6d8')]},
    {cat: 'Mutfak ve yemek', items: [
      K('table', 'Yemek masası 4 kişilik', 120, 80, '#e2cfb4'),
      K('table', 'Yemek masası 6 kişilik', 180, 90, '#d8c2a2'),
      K('roundtable', 'Yuvarlak masa Ø100', 100, 100, '#e2cfb4'),
      K('chair', 'Yemek sandalyesi', 45, 50, '#cfc6b8'),
      K('cabinet', 'Konsol / büfe', 160, 45, '#efe6d8'),
      K('counter', 'Alt dolap + tezgâh 120', 120, 60, '#e9e5de', 'Tezgâh derinliği 60 cm, yükseklik 90 cm'),
      K('counter', 'Alt dolap + tezgâh 60', 60, 60, '#e9e5de'),
      K('wallcab', 'Üst dolap 120', 120, 35, '#efe6d8', 'Tezgâhın üstünde, 35 cm derinlik'),
      K('wallcab', 'Üst dolap 60', 60, 35, '#efe6d8'),
      K('island', 'Mutfak adası', 180, 90, '#e9e5de'),
      K('barstool', 'Bar taburesi', 42, 42, '#6b5d4c'),
      K('stove', 'Ankastre ocak', 60, 52, '#dcdcdc', '4 gözlü, 60 cm'),
      K('ksink', 'Evye (çift gözlü)', 86, 50, '#e1e6ea', '86×50 paslanmaz'),
      K('ovencol', 'Ankastre fırın dolabı', 60, 60, '#efe6d8', 'Boy dolabı içinde fırın + mikrodalga')]},
    {cat: 'Banyo ve ıslak hacim', items: [
      K('toilet', 'Asma klozet', 36, 54, '#ffffff', 'Gömme rezervuarlı'),
      K('toilet', 'Yere oturan klozet', 37, 68, '#ffffff'),
      K('alaturka', 'Hela taşı (alaturka)', 50, 70, '#ffffff', 'Yer tipi tuvalet taşı'),
      K('vanity', 'Lavabo dolabı 60', 60, 46, '#eef1f3'),
      K('vanity', 'Lavabo dolabı 80', 80, 46, '#eef1f3'),
      K('vanity', 'Çift lavabo dolabı 120', 120, 46, '#eef1f3'),
      K('shower', 'Duşakabin 80×80', 80, 80, '#e4edf2'),
      K('shower', 'Duşakabin 90×90', 90, 90, '#e4edf2'),
      K('shower', 'Duşakabin 80×120', 120, 80, '#e4edf2', 'Dikdörtgen tekne'),
      K('bathtub', 'Küvet 170×70', 170, 70, '#eef3f6'),
      K('washer', 'Çamaşır makinesi', 60, 60, '#e6ebee'),
      K('dryer', 'Kurutma makinesi', 60, 60, '#e6ebee'),
      K('waterheater', 'Termosifon', 50, 50, '#f4f4f2', 'Duvara asılı elektrikli su ısıtıcı'),
      K('cabinet', 'Banyo boy dolabı', 40, 30, '#efe6d8')]},
    {cat: 'Beyaz eşya ve tesisat', items: [
      K('fridge', 'Buzdolabı', 70, 70, '#dfe4e8', 'Tek kapılı / alttan donduruculu'),
      K('fridge', 'Gardırop tipi buzdolabı', 91, 72, '#c9ced3', 'Yan yana kapılı'),
      K('dishwasher', 'Bulaşık makinesi', 60, 60, '#c9ced3'),
      K('combi', 'Kombi', 40, 30, '#f4f4f2', 'Duvar tipi doğalgaz kombisi; balkon veya mutfakta'),
      K('radiator', 'Panel radyatör 100', 100, 10, '#f4f4f2', 'Pencere altında, 60 cm yükseklik'),
      K('radiator', 'Panel radyatör 60', 60, 10, '#f4f4f2'),
      K('radiator', 'Havlupan', 50, 8, '#f4f4f2', 'Banyo için'),
      K('acwall', 'Split klima iç ünite', 90, 25, '#f6f7f8'),
      K('aircon', 'Salon tipi klima', 50, 38, '#f6f7f8'),
      K('tv', 'Televizyon 65"', 145, 8, '#1d1d1f'),
      K('tv', 'Televizyon 55"', 123, 8, '#1d1d1f'),
      K('purifier', 'Hava temizleyici', 40, 30, '#f4f4f2')]},
    {cat: 'Çalışma ve hobi', items: [
      K('desk', 'Çalışma masası 140×70', 140, 70, '#d8c2a2'),
      K('officechair', 'Ofis koltuğu', 62, 62, '#4a4f55'),
      K('bookshelf', 'Geniş kitaplık', 160, 35, '#e2cfb4'),
      K('piano', 'Duvar piyanosu', 150, 60, '#1f1d1b'),
      K('treadmill', 'Koşu bandı', 80, 180, '#3a3a3c'),
      K('armchair', 'Okuma koltuğu', 75, 80, '#c9a98a')]},
  ];

  kok.KUTUPHANE = KUTUPHANE;
  if (typeof module !== 'undefined') module.exports = {KUTUPHANE};
})(typeof window !== 'undefined' ? window : globalThis);
