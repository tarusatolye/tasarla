/* ============================================================
 *  tarus Tasarla — tasarım kaydetme, bağlantıyla paylaşma ve galeri
 *
 *  Kullanıcı kararları (2026-10-06): hesap yok; bütün tasarımlar galeride
 *  herkese açık; tasarım şablon olarak eklenebilir; silme ve gizleme yalnız
 *  yöneticide (Pusula SUPERADMIN'i bağlıyken). Kayıtta sunucu bir düzenleme
 *  anahtarı verir; anahtar yalnız bu tarayıcıda (localStorage) durur, aynı
 *  tasarımı güncellemek için gerekir. Başkasının tasarımı / bir şablon açılıp
 *  değiştirilirse "Paylaş" yeni bir tasarım (kopya) kaydeder.
 *
 *  Uçlar (api/, aynı alan adında /api/ altında):
 *    GET    /api/saglik/                  → API yoksa Galeri / Paylaş gizli kalır
 *    POST   /api/tasarimlar/              → kayıt, {kod, anahtar, …}
 *    GET    /api/tasarimlar/<kod>/        → plan + bilgiler
 *    PUT    /api/tasarimlar/<kod>/        → güncelleme (X-Tasarla-Anahtar)
 *    GET    /api/galeri/?sira=&tur=&sayfa=&q=&etiket= → herkese açık liste (tur=sablon; tur=inceleme yönetici;
 *                                           q: başlık/açıklama/etiket araması; etiket: tek etiket süzgeci)
 *    GET    /api/etiketler/?tur=          → en çok kullanılan etiketler (süzgeç düğmeleri)
 *    GET    /api/yonetici/                → {yonetici}: Pusula belirteciyle (Authorization: Bearer)
 *    DELETE /api/tasarimlar/<kod>/        · POST /api/moderasyon/<kod>/ → yalnız yönetici
 *    POST   /api/tasarimlar/<kod>/begen/  · /sikayet/
 *
 *  Paylaşım adresi: https://tasarla.tarus.tr/?t=<kod> (bağlantı önizleme kartı: nginx SSI + api/galeri/meta.py)
 *  Saf fonksiyonlar (planTemizle, kayitGovdesi, paylasimAdresi, etiketAyir, galeriSorgusu) tarayıcısız
 *  test edilir: testler/birim.
 * ============================================================ */
(function (kok) {
  const API = '/api';
  const KAYITLARIM = 'tasarla-tasarimlarim';     // {kod: {anahtar, baslik, tarih}}
  const ACIK = 'tasarla-acik-tasarim';           // şu an planda açık olan tasarım {kod, baslik, yazar_adi}
  const YAZAR = 'tasarla-yazar-adi';

  /* Sunucudan gelen planı bu sürümün çizebileceği hâle getirir: bilinmeyen
   * döşeme malzemesi varsayılana döner, olmayan duvarlar ve bozuk ölçüler atılır.
   * (Sunucu zaten doğruluyor; bu, eski/yeni sürüm farkına karşı.) */
  function planTemizle(plan, {MATS, WALLS, varsayilanMalzeme}){
    const s = plan && typeof plan === 'object' ? plan : {};
    const sayi = n => typeof n === 'number' && isFinite(n);
    const rooms = {};
    for (const [k, r] of Object.entries(s.rooms || {})){
      if (!r || typeof r !== 'object') continue;
      rooms[k] = {name: String(r.name || '').slice(0, 60), mat: MATS[r.mat] ? r.mat : varsayilanMalzeme(k)};
    }
    return {
      furniture: (Array.isArray(s.furniture) ? s.furniture : []).filter(f => f && sayi(f.cx) && sayi(f.cy) && sayi(f.w) && sayi(f.d) && f.w > 0 && f.d > 0)
        .map(f => ({id: String(f.id), type: String(f.type), name: String(f.name || ''), cx: f.cx, cy: f.cy, w: f.w, d: f.d,
                    rot: sayi(f.rot) ? f.rot : 0, color: /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : '#c8c2b6'})),
      rooms,
      demolished: (Array.isArray(s.demolished) ? s.demolished : []).filter(id => /^w\d+$/.test(id) && WALLS[+id.slice(1)]),
      measures: (Array.isArray(s.measures) ? s.measures : []).filter(m => m && m.a && m.b && sayi(m.a.x) && sayi(m.a.y) && sayi(m.b.x) && sayi(m.b.y))
        .map(m => ({a: {x: m.a.x, y: m.a.y}, b: {x: m.b.x, y: m.b.y}})),
    };
  }

  /* Etiket kutusu (virgülle ayrılmış) → sunucunun kabul ettiği biçim: Türkçe küçük harf,
   * «#» öneki ve fazla boşluk atılır, tekil, en çok 5. Geçersiz karakter sunucuda reddedilir. */
  const ETIKET_EN_FAZLA = 5, ETIKET_EN_UZUN = 24;
  const trKucuk = m => String(m).replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr-TR');
  function etiketAyir(metin){
    const liste = Array.isArray(metin) ? metin : String(metin || '').split(',');
    const temiz = [];
    for (const e of liste){
      const ad = trKucuk(String(e).trim().replace(/^#+/, '').split(/\s+/).filter(Boolean).join(' ')).slice(0, ETIKET_EN_UZUN).trim();
      if (ad && !temiz.includes(ad)) temiz.push(ad);
    }
    return temiz.slice(0, ETIKET_EN_FAZLA);
  }

  // Galeri liste sorgusu: boş alanlar gönderilmez
  function galeriSorgusu({tur = 'tumu', sira = 'yeni', sayfa = 1, q = '', etiket = ''} = {}){
    const p = new URLSearchParams({sira});
    if (tur && tur !== 'tumu') p.set('tur', tur);
    const arama = String(q || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (arama) p.set('q', arama);
    if (etiket) p.set('etiket', etiket);
    p.set('sayfa', String(sayfa));
    return `/galeri/?${p}`;
  }

  function kayitGovdesi(state, form, onizleme, kaynak){
    return {
      baslik: String(form.baslik || '').trim().slice(0, 80),
      yazar_adi: String(form.yazar_adi || '').trim().slice(0, 60),
      aciklama: String(form.aciklama || '').trim().slice(0, 500),
      sablon: !!form.sablon,
      etiketler: etiketAyir(form.etiketler),
      plan: {furniture: state.furniture, rooms: state.rooms, demolished: state.demolished, measures: state.measures},
      onizleme: onizleme || '',
      kaynak: kaynak || '',
      web_sitesi: form.web_sitesi || '',
    };
  }

  const paylasimAdresi = (kod, koken) => `${koken}/?t=${encodeURIComponent(kod)}`;

  const disa = {planTemizle, kayitGovdesi, paylasimAdresi, etiketAyir, galeriSorgusu};
  kok.TasarlaGaleri = disa;
  if (typeof module !== 'undefined') module.exports = disa;
  if (typeof document === 'undefined') return;

  /* ======================= Tarayıcı ======================= */
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const K = () => kok.TarusKabuk;
  const P = () => kok.TasarlaPlan;
  const oku = (ad, v) => { try { return JSON.parse(localStorage.getItem(ad)) ?? v; } catch(e) { return v; } };
  const yaz = (ad, d) => { try { localStorage.setItem(ad, JSON.stringify(d)); } catch(e) {} };
  const kayitlarim = () => oku(KAYITLARIM, {});
  const acikTasarim = () => oku(ACIK, null);
  const tarihYaz = iso => new Date(iso).toLocaleDateString('tr-TR', {day: '2-digit', month: '2-digit', year: 'numeric'});

  let yonetici = false;                          // Pusula SUPERADMIN'i bağlıyken (sunucu doğrular)
  async function istek(yol, {yontem = 'GET', govde, anahtar, yetkili} = {}){
    const basliklar = {'Accept': 'application/json'};
    if (govde !== undefined) basliklar['Content-Type'] = 'application/json';
    if (anahtar) basliklar['X-Tasarla-Anahtar'] = anahtar;
    const belirtec = kok.PusulaOturum?.belirtec?.();
    if (yetkili && belirtec) basliklar['Authorization'] = `Bearer ${belirtec}`;
    const y = await fetch(API + yol, {method: yontem, headers: basliklar, body: govde === undefined ? undefined : JSON.stringify(govde), credentials: 'omit'});
    if (y.status === 204) return null;
    let veri = null; try { veri = await y.json(); } catch(e) {}
    if (!y.ok){
      const hata = new Error(hataMetni(y.status, veri)); hata.durum = y.status; throw hata;
    }
    return veri;
  }
  function hataMetni(durum, veri){
    if (durum === 429) return 'Çok sık işlem yapıldı; biraz sonra yeniden deneyin.';
    if (durum === 403) return veri?.detail || 'Bu işlem için yetkiniz yok.';
    if (durum === 404) return 'Tasarım bulunamadı ya da kaldırılmış.';
    if (veri && typeof veri === 'object'){
      const ilk = Object.values(veri).flat().find(v => typeof v === 'string');
      if (ilk) return ilk;
    }
    return 'Sunucuya ulaşılamadı; biraz sonra yeniden deneyin.';
  }

  // Plan görseli (3200 px PNG) paylaşım için 1200 px WebP'ye küçültülür
  async function onizlemeUret(){
    const blob = await P().pngBlob();
    if (!blob) return '';
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((coz, red) => { const i = new Image(); i.onload = () => coz(i); i.onerror = red; i.src = url; });
      const W = 1200, H = Math.round(W * img.height / img.width);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      cv.getContext('2d').drawImage(img, 0, 0, W, H);
      return cv.toDataURL('image/webp', .85);
    } catch(e) { return ''; } finally { URL.revokeObjectURL(url); }
  }

  /* ---------- Paylaş ---------- */
  async function paylas(){
    const acik = acikTasarim(), benim = acik && kayitlarim()[acik.kod];
    const govde = `
      <form class="form galeri-form" onsubmit="return false">
        <label class="full">Başlık<input id="gBaslik" maxlength="80" required value="${esc(acik?.baslik || '')}" placeholder="Örn. Ferah salon, çalışma köşeli yatak odası" autofocus></label>
        <label class="full">Adınız <small>(isteğe bağlı, galeride görünür)</small><input id="gYazar" maxlength="60" value="${esc(acik?.yazar_adi || localStorage.getItem(YAZAR) || '')}"></label>
        <label class="full">Açıklama <small>(isteğe bağlı)</small><textarea id="gAciklama" maxlength="500" rows="3">${esc(benim ? acik.aciklama || '' : '')}</textarea></label>
        <label class="full">Etiketler <small>(isteğe bağlı, virgülle ayırın, en çok ${ETIKET_EN_FAZLA})</small><input id="gEtiketler" maxlength="160" autocomplete="off" value="${esc(benim ? (acik.etiketler || []).join(', ') : '')}" placeholder="Örn. salon, küçük ev, iskandinav"></label>
        <label class="full onay tarus-onay-etiket"><input type="checkbox" class="tarus-onay" id="gSablon" ${benim && acik.sablon ? 'checked' : ''}> Şablon olarak ekle <small>(başkaları yeni tasarıma bununla başlayabilir)</small></label>
        <input id="gWeb" class="bal-kupu" tabindex="-1" autocomplete="off" aria-hidden="true">
      </form>
      <p class="muted galeri-not">Tasarımlar galeride herkese açıktır. ${benim ? 'Bu tasarımı daha önce bu tarayıcıdan kaydettiniz; «Güncelle» aynı bağlantıyı korur.' : acik ? `«${esc(acik.baslik || acik.kaynakBaslik)}» üzerine kurduğunuz plan yeni bir tasarım olarak kaydedilir.` : 'Hesap gerekmez. Kayıttan sonra bağlantıyı paylaşabilirsiniz; tasarımı yalnız bu tarayıcıdan güncelleyebilirsiniz.'}</p>`;
    const dugmeler = [{etiket: 'Vazgeç', deger: null}];
    const gonder = yeni => async (b, kapat) => {
      const form = {baslik: $('#gBaslik').value, yazar_adi: $('#gYazar').value, aciklama: $('#gAciklama').value,
                    sablon: $('#gSablon').checked, etiketler: $('#gEtiketler').value, web_sitesi: $('#gWeb').value};
      if (!form.baslik.trim()){ $('#gBaslik').focus(); return K().toast('Başlık gerekli', 'uyari'); }
      b.disabled = true;
      try {
        const g = kayitGovdesi(P().state(), form, await onizlemeUret(), !benim && acik ? acik.kod : '');
        const sonuc = yeni ? await istek('/tasarimlar/', {yontem: 'POST', govde: g})
                           : await istek(`/tasarimlar/${acik.kod}/`, {yontem: 'PUT', govde: g, anahtar: benim.anahtar});
        const k = kayitlarim();
        k[sonuc.kod] = {anahtar: yeni ? sonuc.anahtar : benim.anahtar, baslik: sonuc.baslik, tarih: sonuc.guncelleme};
        yaz(KAYITLARIM, k);
        yaz(ACIK, {kod: sonuc.kod, baslik: sonuc.baslik, yazar_adi: sonuc.yazar_adi, aciklama: sonuc.aciklama, sablon: sonuc.sablon, etiketler: sonuc.etiketler || []});
        try { localStorage.setItem(YAZAR, form.yazar_adi.trim()); } catch(e) {}
        P().baslik(sonuc.baslik);
        kapat(true);
        baglantiGoster(sonuc);
      } catch(e){ K().toast(e.message, 'hata'); b.disabled = false; }
    };
    if (benim) dugmeler.push({etiket: 'Yeni olarak kaydet', kapatmaz: true, tikla: gonder(true)});
    dugmeler.push({etiket: benim ? 'Güncelle' : 'Kaydet ve paylaş', ikon: 'share', tur: 'birincil', kapatmaz: true, tikla: gonder(!benim)});
    await K().dialog({baslik: 'Tasarımı paylaş', govde, dugmeler});
  }

  function baglantiGoster(t){
    const adres = paylasimAdresi(t.kod, location.origin);
    K().dialog({baslik: 'Tasarım kaydedildi', genislik: 'dar', govde: `
      <p>Tasarımınız galeride herkese açık${t.sablon ? ' ve şablonlar arasında' : ''}. Bağlantı:</p>
      <div class="galeri-baglanti"><input id="gAdres" readonly value="${esc(adres)}"><button class="dugme" id="gKopyala">${kok.ikon('copy')}Kopyala</button></div>
      <p class="muted galeri-not">Düzenleme anahtarı bu tarayıcıda saklanır. Tarayıcı verisini silerseniz tasarımı artık güncelleyemezsiniz; bağlantı çalışmaya devam eder. Tasarımları yalnız yönetici kaldırabilir.</p>`,
      dugmeler: [{etiket: 'Tamam', tur: 'birincil'}],
      acilis: kutu => {
        kutu.querySelector('#gKopyala').onclick = async () => {
          try { await navigator.clipboard.writeText(adres); K().toast('Bağlantı kopyalandı', 'basari'); }
          catch(e){ kutu.querySelector('#gAdres').select(); }
        };
      }});
  }

  /* ---------- Galeri ---------- */
  function kart(t){
    return `<article class="galeri-kart" data-kod="${esc(t.kod)}">
      <button class="galeri-gorsel" data-ac title="${t.sablon ? 'Bu şablonla başla' : 'Tasarımı aç'}">${t.onizleme ? `<img src="${esc(t.onizleme)}" alt="" loading="lazy">` : kok.ikon('image')}${t.sablon ? '<span class="galeri-rozet">Şablon</span>' : ''}</button>
      <div class="galeri-bilgi">
        <b title="${esc(t.baslik)}">${esc(t.baslik)}</b>
        <small>${esc(t.yazar_adi || 'Adsız')} · ${tarihYaz(t.olusturma)}${t.sikayet_sayisi ? ` · ${t.sikayet_sayisi} şikâyet` : ''}</small>
        ${t.etiketler?.length ? `<div class="galeri-etiketler">${t.etiketler.map(e => `<button class="galeri-etiket" data-etiket-sec="${esc(e)}" title="«${esc(e)}» etiketli tasarımlar">#${esc(e)}</button>`).join('')}</div>` : ''}
        ${t.sikayetler ? sikayetOzeti(t) : ''}
      </div>
      <div class="galeri-eylem">
        <button class="dugme kucuk" data-begen title="Beğen" aria-label="Beğen: ${t.begeni_sayisi}">${kok.ikon('heart', 14)}<span>${t.begeni_sayisi}</span></button>
        <button class="dugme kucuk birincil" data-ac>${t.sablon ? 'Kullan' : 'Aç'}</button>
        ${yonetici ? `${t.sikayetler ? `<button class="dugme kucuk" data-yoksay title="Şikâyetleri yok say, galeriye geri al">Yok say</button>` : ''}
                      <button class="dugme kucuk" data-gizle title="Galeriden ve bağlantısından gizle" aria-label="Gizle">${kok.ikon('flag', 14)}</button>
                      <button class="dugme kucuk tehlike" data-sil title="Tasarımı sil (yönetici)" aria-label="Tasarımı sil">${kok.ikon('trash', 14)}</button>`
                   : `<button class="dugme kucuk" data-sikayet title="Uygunsuz içerik bildir" aria-label="Uygunsuz içerik bildir">${kok.ikon('flag', 14)}</button>`}
      </div>
    </article>`;
  }

  // İnceleme (yönetici): şikâyetlerin türe göre sayısı, galeri durumu ve son açıklamalar
  function sikayetOzeti(t){
    const s = t.sikayetler;
    return `<div class="galeri-sikayet">
      <small>${t.galeride ? 'Galeride' : 'Galeriden düştü'} · ${s.turler.map(x => `${esc(x.etiket)} ${x.sayi}`).join(' · ')}</small>
      ${s.aciklamalar.length ? `<ul>${s.aciklamalar.map(a => `<li title="${tarihYaz(a.tarih)}">«${esc(a.neden)}»</li>`).join('')}</ul>` : ''}
    </div>`;
  }

  async function yoneticiMi(){
    if (!kok.PusulaOturum?.oturumVar?.()) return false;
    try { return (await istek('/yonetici/', {yetkili: true})).yonetici === true; } catch(e) { return false; }
  }

  /* ---------- Hızlı Bakış sayfası ----------
     Galeri pencere değil sayfa (kullanıcı, 2026-10-06): uygulama bununla açılır, üst çubuktaki
     «Hızlı Bakış» / «Çizime dön» düğmesi iki görünüm arasında geçer. Çizim alanı DOM'da kalır,
     `.app.hb-acik` yalnız görünmez yapar (tuval boyutu ve plan durumu korunur). */
  const sayfaEl = () => $('#hizliBakis');
  const sayfaAcikMi = () => !!sayfaEl() && !sayfaEl().hidden;
  function dugmeEtiketi(){
    const b = $('#galeriBtn'); if (!b) return;
    const acik = sayfaAcikMi();
    b.querySelector('.aktar-yazi').textContent = acik ? 'Çizime dön' : 'Hızlı Bakış';
    b.setAttribute('aria-label', acik ? 'Çizime dön' : 'Hızlı Bakış');
    b.title = acik ? 'Plan çizimine dön' : 'Herkesin paylaştığı tasarımlar ve şablonlar';
    b.setAttribute('aria-pressed', String(acik));
  }
  // Üst çubuk araması (index.html #galeriAra): yazmayı bırakınca (300 ms) sunucuya sorulur;
  // çizimdeyken yazılırsa Hızlı Bakış bu metinle açılır. Esc kutuyu temizler.
  let aramaUygula = null;
  function ustAramaBagla(){
    const ara = $('#galeriAra'); if (!ara) return;
    $('#ustArama').hidden = false;
    let zaman = null;
    let acilis = null;                            // galeriAc beklerken ikinci kez açılmasın
    const uygula = () => { if (sayfaAcikMi()) aramaUygula?.(ara.value); else if (!acilis) acilis = galeriAc().finally(() => { acilis = null; }); };
    ara.addEventListener('input', () => { clearTimeout(zaman); zaman = setTimeout(uygula, 300); });
    ara.addEventListener('keydown', e => {
      if (e.key === 'Escape' && ara.value){ e.stopPropagation(); clearTimeout(zaman); ara.value = ''; if (sayfaAcikMi()) aramaUygula?.(''); }
      if (e.key === 'Enter'){ clearTimeout(zaman); uygula(); }
    });
  }
  function sayfaKapat(){
    if (!sayfaEl()) return;
    sayfaEl().hidden = true;
    document.querySelector('.app')?.classList.remove('hb-acik');
    dugmeEtiketi();
    window.dispatchEvent(new Event('resize'));   // tuval görünür olunca ölçüsünü tazelesin
  }
  disa.sayfaKapat = sayfaKapat;

  async function galeriAc(){
    const el = sayfaEl();
    if (!el) return;
    if (sayfaAcikMi()) return sayfaKapat();
    yonetici = await yoneticiMi();
    // Arama üst çubukta (TSR-10, kabuk .tarus-ust-arama): açılışta kutudaki metinle başlar
    let tur = 'tumu', sira = 'yeni', sonraki = 1, kutuEl = el, q = ($('#galeriAra')?.value || ''), etiket = '', istekNo = 0;
    const yukle = async (sifirla) => {
      const liste = kutuEl.querySelector('#galeriListe'), daha = kutuEl.querySelector('#galeriDaha');
      const no = ++istekNo;                       // yazarken eski yanıt yenisinin üstüne yazmasın
      if (sifirla){ sonraki = 1; liste.innerHTML = `<div class="galeri-bos">${kok.ikon('loader')} Yükleniyor…</div>`; }
      daha.hidden = true;
      try {
        const v = await istek(galeriSorgusu({tur, sira, sayfa: sifirla ? 1 : sonraki, q, etiket}), {yetkili: tur === 'inceleme'});
        if (no !== istekNo) return;
        if (sifirla) liste.innerHTML = '';
        liste.insertAdjacentHTML('beforeend', v.sonuclar.map(kart).join(''));
        if (!liste.children.length) liste.innerHTML = `<div class="galeri-bos">${q.trim() || etiket ? 'Aramanızla eşleşen tasarım yok.'
          : {tumu: 'Galeride henüz tasarım yok. İlk paylaşan siz olun.', sablon: 'Henüz şablon yok. Paylaşırken «Şablon olarak ekle»yi işaretleyin.', inceleme: 'Şikâyet alan tasarım yok.'}[tur]}</div>`;
        sonraki = v.sonraki; daha.hidden = !sonraki;
      } catch(e){ if (no === istekNo) liste.innerHTML = `<div class="galeri-bos">${esc(e.message)}</div>`; }
    };
    // Etiket süzgeci: galeride en çok kullanılan etiketler; seçili etiket listede olmasa da görünür
    const etiketleriYukle = async () => {
      const yer = kutuEl.querySelector('#galeriEtiketler');
      let liste = [];
      try { liste = (await istek(`/etiketler/${tur === 'sablon' ? '?tur=sablon' : ''}`)).etiketler || []; } catch(e) {}
      const adlar = liste.map(e => e.ad);
      if (etiket && !adlar.includes(etiket)) adlar.unshift(etiket);
      yer.hidden = !adlar.length;
      yer.innerHTML = adlar.map(ad => `<button class="galeri-etiket${ad === etiket ? ' is-active' : ''}" data-etiket-sec="${esc(ad)}" aria-pressed="${ad === etiket}">#${esc(ad)}</button>`).join('');
    };
    const etiketSec = ad => {
      etiket = etiket === ad ? '' : ad;
      let var_ = false;
      kutuEl.querySelectorAll('#galeriEtiketler [data-etiket-sec]').forEach(b => {
        const secili = b.dataset.etiketSec === etiket; if (secili) var_ = true;
        b.classList.toggle('is-active', secili); b.setAttribute('aria-pressed', String(secili));
      });
      if (etiket && !var_) etiketleriYukle();
      yukle(true);
    };
    const segment = (ad, secenekler, secili) => `<div class="tarus-toolbar-segment" role="tablist" data-grup="${ad}">${secenekler.map(([d, e]) =>
      `<button class="tarus-toolbar-segment-button btn${d === secili ? ' is-active' : ''}" data-${ad}="${d}" role="tab" aria-selected="${d === secili}">${e}</button>`).join('')}</div>`;
    const kutu = el;
    kutu.innerHTML = `
      <div class="hb-baslik">
        <div><h1>Hızlı Bakış</h1><p class="muted">Herkesin paylaştığı tasarımlar ve şablonlar. Birini açın ya da üst çubuktaki «Çizime dön» ile çiziminize devam edin.</p></div>
      </div>
      <div class="galeri-ust">
        ${segment('tur', [['tumu', 'Tüm tasarımlar'], ['sablon', 'Şablonlar'], ...(yonetici ? [['inceleme', 'İnceleme']] : [])], tur)}
        <div class="galeri-sag">
          ${segment('sira', [['yeni', 'En yeni'], ['begeni', 'En beğenilen']], sira)}
        </div>
      </div>
      <div class="galeri-etiketler suzgec" id="galeriEtiketler" role="group" aria-label="Etikete göre süz" hidden></div>
      <div class="galeri-izgara" id="galeriListe"></div>
      <div class="galeri-alt"><button class="dugme" id="galeriDaha" hidden>Daha fazla göster</button></div>`;
    kutu.hidden = false;
    document.querySelector('.app')?.classList.add('hb-acik');
    dugmeEtiketi();
    ['tur', 'sira'].forEach(ad => kutu.querySelectorAll(`[data-${ad}]`).forEach(b => b.onclick = () => {
      if (ad === 'tur') tur = b.dataset.tur; else sira = b.dataset.sira;
      kutu.querySelectorAll(`[data-${ad}]`).forEach(x => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-selected', String(x === b)); });
      if (ad === 'tur') etiketleriYukle();
      yukle(true);
    }));
    // Üst çubuk araması bu sayfanın sorgusunu değiştirir (ustAramaBagla)
    aramaUygula = metin => { const once = q.trim(); q = metin; if (q.trim() !== once) yukle(true); };
    kutu.querySelector('#galeriEtiketler').onclick = e => { const b = e.target.closest('[data-etiket-sec]'); if (b) etiketSec(b.dataset.etiketSec); };
    kutu.querySelector('#galeriDaha').onclick = () => yukle(false);
    etiketleriYukle();
    kutu.querySelector('#galeriListe').addEventListener('click', async e => {
      const kartEl = e.target.closest('.galeri-kart'); if (!kartEl) return;
      const kod = kartEl.dataset.kod;
      const etiketBtn = e.target.closest('[data-etiket-sec]');
      if (etiketBtn){ etiketSec(etiketBtn.dataset.etiketSec); kutu.scrollTo?.({top: 0, behavior: 'smooth'}); return; }
      if (e.target.closest('[data-ac]')){ if (await tasarimAc(kod)) sayfaKapat(); return; }
      if (e.target.closest('[data-begen]')){
        const b = e.target.closest('[data-begen]');
        try { const v = await istek(`/tasarimlar/${kod}/begen/`, {yontem: 'POST'}); b.querySelector('span').textContent = v.begeni_sayisi; b.classList.add('is-active'); }
        catch(err){ K().toast(err.message, 'hata'); }
      }
      if (e.target.closest('[data-sikayet]')) sikayetEt(kod);
      if (e.target.closest('[data-yoksay]') && await yoneticiIslem(kod, 'yoksay')) kartEl.remove();
      if (e.target.closest('[data-gizle]') && await yoneticiIslem(kod, 'gizle')) kartEl.remove();
      if (e.target.closest('[data-sil]') && await yoneticiIslem(kod, 'sil')) kartEl.remove();
    });
    yukle(true);
  }

  // Sunucudaki Sikayet.Tur ile aynı değerler (api/galeri/models.py)
  const SIKAYET_TURLERI = [['uygunsuz', 'Uygunsuz içerik'], ['spam', 'Reklam / istenmeyen içerik'],
    ['telif', 'Başkasının tasarımı / telif'], ['kisisel', 'Kişisel bilgi içeriyor'], ['diger', 'Diğer']];

  async function sikayetEt(kod){
    const sonuc = await K().dialog({baslik: 'Uygunsuz içerik bildir', genislik: 'dar', govde: `
      <p>Bu tasarımı neden bildiriyorsunuz? Birkaç bildirim alan tasarım galeriden kaldırılır ve yönetici inceler.</p>
      <div class="galeri-etiketler suzgec sikayet-turleri" role="radiogroup" aria-label="Bildirim nedeni">
        ${SIKAYET_TURLERI.map(([d, e], i) => `<button type="button" class="galeri-etiket${i === 0 ? ' is-active' : ''}" role="radio" aria-checked="${i === 0}" data-sikayet-tur="${d}">${e}</button>`).join('')}
      </div>
      <div class="form"><label class="full">Açıklama (isteğe bağlı)<input id="gNeden" maxlength="200"></label></div>`,
      acilis: kutu => {
        kutu.querySelector('.sikayet-turleri').onclick = e => {
          const b = e.target.closest('[data-sikayet-tur]'); if (!b) return;
          kutu.querySelectorAll('[data-sikayet-tur]').forEach(x => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-checked', String(x === b)); });
        };
      },
      dugmeler: [{etiket: 'Vazgeç', deger: null}, {etiket: 'Bildir', tur: 'tehlike', kapatmaz: true, tikla: (b, kapat) =>
        kapat({tur: $('[data-sikayet-tur].is-active')?.dataset.sikayetTur || 'diger', neden: $('#gNeden').value})}]});
    if (!sonuc) return;
    try { await istek(`/tasarimlar/${kod}/sikayet/`, {yontem: 'POST', govde: sonuc}); K().toast('Bildiriminiz alındı. Teşekkürler.', 'basari'); }
    catch(e){ K().toast(e.message, 'hata'); }
  }

  // Yalnız yönetici: sil (kalıcı), gizle (listeden ve bağlantısından kalkar, veri durur) ya da
  // yok say (şikâyetler silinir, tasarım galeriye döner)
  async function yoneticiIslem(kod, islem){
    const sil = islem === 'sil', yoksay = islem === 'yoksay';
    if (!await K().onayla(sil
      ? {baslik: 'Tasarımı sil', metin: 'Tasarım galeriden ve bağlantısından kalıcı olarak silinir. Bu işlem geri alınamaz.', onay: 'Sil', tehlike: true}
      : yoksay
        ? {baslik: 'Şikâyetleri yok say', metin: 'Bu tasarımın şikâyetleri silinir ve tasarım galeride yeniden görünür.', onay: 'Yok say'}
        : {baslik: 'Tasarımı gizle', metin: 'Tasarım galeride görünmez, bağlantısı açılmaz. Veri silinmez.', onay: 'Gizle'})) return false;
    try {
      if (sil) await istek(`/tasarimlar/${kod}/`, {yontem: 'DELETE', yetkili: true});
      else await istek(`/moderasyon/${kod}/`, {yontem: 'POST', govde: yoksay ? {sikayetleri_temizle: true, galeride: true} : {gizli: true}, yetkili: true});
      if (!yoksay){ const k = kayitlarim(); if (k[kod]){ delete k[kod]; yaz(KAYITLARIM, k); } }
      K().toast(sil ? 'Tasarım silindi' : yoksay ? 'Şikâyetler yok sayıldı, tasarım galeride' : 'Tasarım gizlendi', 'basari');
      return true;
    } catch(e){ K().toast(e.message, 'hata'); return false; }
  }

  /* ---------- Bağlantıdan / galeriden açma ---------- */
  async function tasarimAc(kod){
    let t;
    try { t = await istek(`/tasarimlar/${encodeURIComponent(kod)}/`, {anahtar: kayitlarim()[kod]?.anahtar}); }
    catch(e){ K().toast(e.message, 'hata'); return false; }
    const sablon = t.sablon && !t.sahibi;
    const tamam = await K().dialog({baslik: t.baslik, govde: `
      ${t.onizleme ? `<img class="galeri-buyuk" src="${esc(t.onizleme)}" alt="">` : ''}
      <p class="galeri-kunye">${t.sablon ? '<span class="galeri-rozet satir">Şablon</span> ' : ''}<b>${esc(t.yazar_adi || 'Adsız')}</b> · ${tarihYaz(t.olusturma)} · <span class="galeri-begeni" aria-label="${t.begeni_sayisi} beğeni">${kok.ikon('heart', 14)}${t.begeni_sayisi}</span></p>
      ${t.aciklama ? `<p class="galeri-aciklama">${esc(t.aciklama)}</p>` : ''}
      ${t.etiketler?.length ? `<div class="galeri-etiketler">${t.etiketler.map(e => `<span class="galeri-etiket">#${esc(e)}</span>`).join('')}</div>` : ''}
      <p class="muted galeri-not">${sablon ? 'Şablon mevcut planınızın yerine açılır ve yeni tasarımınızın başlangıcı olur;' : 'Tasarım mevcut planınızın yerine açılır;'} «Geri al» (Ctrl Z) ile önceki planınıza dönebilirsiniz.${t.sahibi ? '' : ' Değişikliklerinizi «Paylaş» ile kendi tasarımınız olarak kaydedebilirsiniz.'}</p>`,
      dugmeler: [{etiket: 'Vazgeç', deger: null}, {etiket: sablon ? 'Bu şablonla başla' : 'Planı aç', tur: 'birincil'}]});
    if (!tamam) return false;
    const p = P();
    p.yukle(planTemizle(t.plan, {MATS: p.MATS, WALLS: p.WALLS, varsayilanMalzeme: id => p.ROOMS.find(r => r.id === id)?.mat || Object.keys(p.MATS)[0]}));
    // Şablondan başlanınca başlık boş: Paylaş yeni tasarım olarak kaydeder (kaynak = şablon)
    yaz(ACIK, sablon ? {kod: t.kod, baslik: '', kaynakBaslik: t.baslik}
                     : {kod: t.kod, baslik: t.baslik, yazar_adi: t.yazar_adi, aciklama: t.aciklama, sablon: t.sablon, etiketler: t.etiketler || []});
    p.baslik(sablon ? `«${t.baslik}» şablonundan` : t.baslik);
    return true;
  }

  // Plan sıfırlanınca / dosyadan yüklenince açık tasarım bağı kalkar (Paylaş yeni kayıt açar)
  disa.ayir = () => { try { localStorage.removeItem(ACIK); } catch(e) {} P()?.baslik(''); };

  async function basla(){
    const a = acikTasarim();
    if (a) P().baslik(a.baslik || (a.kaynakBaslik ? `«${a.kaynakBaslik}» şablonundan` : ''));
    let hazir = false;
    // Yalnız 200 yetmez: API'siz bir nginx /api/ yolunu index.html ile de yanıtlayabilir.
    // API'siz tek ortam yerel statik önizleme (launch.json `tasarla`, localhost:8095):
    // orada istek atılmaz, tarayıcı konsola 404 yazmasın (denetim TSR-08, kullanıcı kararı).
    const apisizOnizleme = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.port === '8095';
    if (!apisizOnizleme) {
      try { hazir = (await (await fetch(API + '/saglik/', {credentials: 'omit'})).json()).ok === true; } catch(e) {}
    }
    if (!hazir) return;                          // API yayında değil: paylaşım özellikleri gizli kalır
    $('#galeriBtn').hidden = $('#paylasBtn').hidden = false;
    $('#galeriBtn').onclick = galeriAc;
    ustAramaBagla();
    $('#paylasBtn').onclick = paylas;
    const kod = new URLSearchParams(location.search).get('t');
    if (kod){
      history.replaceState(null, '', location.pathname);   // yenilemede yeniden sorulmasın
      tasarimAc(kod);
    } else {
      galeriAc();                                          // açılış ekranı Hızlı Bakış
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', basla); else basla();
})(typeof window !== 'undefined' ? window : globalThis);
