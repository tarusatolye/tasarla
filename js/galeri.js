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
 *    GET    /api/galeri/?sira=&tur=&sayfa= → herkese açık liste (tur=sablon; tur=inceleme yönetici)
 *    GET    /api/yonetici/                → {yonetici}: Pusula belirteciyle (Authorization: Bearer)
 *    DELETE /api/tasarimlar/<kod>/        · POST /api/moderasyon/<kod>/ → yalnız yönetici
 *    POST   /api/tasarimlar/<kod>/begen/  · /sikayet/
 *
 *  Paylaşım adresi: https://tasarla.tarus.tr/?t=<kod>
 *  Saf fonksiyonlar (planTemizle, kayitGovdesi, paylasimAdresi) tarayıcısız test edilir: testler/birim.
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

  function kayitGovdesi(state, form, onizleme, kaynak){
    return {
      baslik: String(form.baslik || '').trim().slice(0, 80),
      yazar_adi: String(form.yazar_adi || '').trim().slice(0, 60),
      aciklama: String(form.aciklama || '').trim().slice(0, 500),
      sablon: !!form.sablon,
      plan: {furniture: state.furniture, rooms: state.rooms, demolished: state.demolished, measures: state.measures},
      onizleme: onizleme || '',
      kaynak: kaynak || '',
      web_sitesi: form.web_sitesi || '',
    };
  }

  const paylasimAdresi = (kod, koken) => `${koken}/?t=${encodeURIComponent(kod)}`;

  const disa = {planTemizle, kayitGovdesi, paylasimAdresi};
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
        <label class="full onay"><input type="checkbox" id="gSablon" ${benim && acik.sablon ? 'checked' : ''}> Şablon olarak ekle <small>(başkaları yeni tasarıma bununla başlayabilir)</small></label>
        <input id="gWeb" class="bal-kupu" tabindex="-1" autocomplete="off" aria-hidden="true">
      </form>
      <p class="muted galeri-not">Tasarımlar galeride herkese açıktır. ${benim ? 'Bu tasarımı daha önce bu tarayıcıdan kaydettiniz; «Güncelle» aynı bağlantıyı korur.' : acik ? `«${esc(acik.baslik || acik.kaynakBaslik)}» üzerine kurduğunuz plan yeni bir tasarım olarak kaydedilir.` : 'Hesap gerekmez. Kayıttan sonra bağlantıyı paylaşabilirsiniz; tasarımı yalnız bu tarayıcıdan güncelleyebilirsiniz.'}</p>`;
    const dugmeler = [{etiket: 'Vazgeç', deger: null}];
    const gonder = yeni => async (b, kapat) => {
      const form = {baslik: $('#gBaslik').value, yazar_adi: $('#gYazar').value, aciklama: $('#gAciklama').value,
                    sablon: $('#gSablon').checked, web_sitesi: $('#gWeb').value};
      if (!form.baslik.trim()){ $('#gBaslik').focus(); return K().toast('Başlık gerekli', 'uyari'); }
      b.disabled = true;
      try {
        const g = kayitGovdesi(P().state(), form, await onizlemeUret(), !benim && acik ? acik.kod : '');
        const sonuc = yeni ? await istek('/tasarimlar/', {yontem: 'POST', govde: g})
                           : await istek(`/tasarimlar/${acik.kod}/`, {yontem: 'PUT', govde: g, anahtar: benim.anahtar});
        const k = kayitlarim();
        k[sonuc.kod] = {anahtar: yeni ? sonuc.anahtar : benim.anahtar, baslik: sonuc.baslik, tarih: sonuc.guncelleme};
        yaz(KAYITLARIM, k);
        yaz(ACIK, {kod: sonuc.kod, baslik: sonuc.baslik, yazar_adi: sonuc.yazar_adi, aciklama: sonuc.aciklama, sablon: sonuc.sablon});
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
      </div>
      <div class="galeri-eylem">
        <button class="dugme kucuk" data-begen title="Beğen" aria-label="Beğen: ${t.begeni_sayisi}">${kok.ikon('heart', 14)}<span>${t.begeni_sayisi}</span></button>
        <button class="dugme kucuk birincil" data-ac>${t.sablon ? 'Kullan' : 'Aç'}</button>
        ${yonetici ? `<button class="dugme kucuk" data-gizle title="Galeriden ve bağlantısından gizle" aria-label="Gizle">${kok.ikon('flag', 14)}</button>
                      <button class="dugme kucuk tehlike" data-sil title="Tasarımı sil (yönetici)" aria-label="Tasarımı sil">${kok.ikon('trash', 14)}</button>`
                   : `<button class="dugme kucuk" data-sikayet title="Uygunsuz içerik bildir" aria-label="Uygunsuz içerik bildir">${kok.ikon('flag', 14)}</button>`}
      </div>
    </article>`;
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
    let tur = 'tumu', sira = 'yeni', sonraki = 1, kutuEl = el;
    const yukle = async (sifirla) => {
      const liste = kutuEl.querySelector('#galeriListe'), daha = kutuEl.querySelector('#galeriDaha');
      if (sifirla){ sonraki = 1; liste.innerHTML = `<div class="galeri-bos">${kok.ikon('loader')} Yükleniyor…</div>`; }
      daha.hidden = true;
      try {
        const ek = tur === 'tumu' ? '' : `&tur=${tur}`;
        const v = await istek(`/galeri/?sira=${sira}${ek}&sayfa=${sonraki}`, {yetkili: tur === 'inceleme'});
        if (sifirla) liste.innerHTML = '';
        liste.insertAdjacentHTML('beforeend', v.sonuclar.map(kart).join(''));
        if (!liste.children.length) liste.innerHTML = `<div class="galeri-bos">${{tumu: 'Galeride henüz tasarım yok. İlk paylaşan siz olun.', sablon: 'Henüz şablon yok. Paylaşırken «Şablon olarak ekle»yi işaretleyin.', inceleme: 'Şikâyet alan tasarım yok.'}[tur]}</div>`;
        sonraki = v.sonraki; daha.hidden = !sonraki;
      } catch(e){ liste.innerHTML = `<div class="galeri-bos">${esc(e.message)}</div>`; }
    };
    const segment = (ad, secenekler, secili) => `<div class="tarus-toolbar-segment" role="tablist" data-grup="${ad}">${secenekler.map(([d, e]) =>
      `<button class="tarus-toolbar-segment-button btn${d === secili ? ' is-active' : ''}" data-${ad}="${d}" role="tab" aria-selected="${d === secili}">${e}</button>`).join('')}</div>`;
    const kutu = el;
    kutu.innerHTML = `
      <div class="hb-baslik">
        <div><h1>Hızlı Bakış</h1><p class="muted">Herkesin paylaştığı tasarımlar ve şablonlar. Birini açın ya da çiziminize devam edin.</p></div>
        <button class="dugme birincil" id="hbCizim">${kok.ikon('ruler')}<span>Çizime dön</span></button>
      </div>
      <div class="galeri-ust">
        ${segment('tur', [['tumu', 'Tüm tasarımlar'], ['sablon', 'Şablonlar'], ...(yonetici ? [['inceleme', 'İnceleme']] : [])], tur)}
        ${segment('sira', [['yeni', 'En yeni'], ['begeni', 'En beğenilen']], sira)}
      </div>
      <div class="galeri-izgara" id="galeriListe"></div>
      <div class="galeri-alt"><button class="dugme" id="galeriDaha" hidden>Daha fazla göster</button></div>`;
    kutu.hidden = false;
    document.querySelector('.app')?.classList.add('hb-acik');
    dugmeEtiketi();
    kutu.querySelector('#hbCizim').onclick = sayfaKapat;
    ['tur', 'sira'].forEach(ad => kutu.querySelectorAll(`[data-${ad}]`).forEach(b => b.onclick = () => {
      if (ad === 'tur') tur = b.dataset.tur; else sira = b.dataset.sira;
      kutu.querySelectorAll(`[data-${ad}]`).forEach(x => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-selected', String(x === b)); });
      yukle(true);
    }));
    kutu.querySelector('#galeriDaha').onclick = () => yukle(false);
    kutu.querySelector('#galeriListe').addEventListener('click', async e => {
      const kartEl = e.target.closest('.galeri-kart'); if (!kartEl) return;
      const kod = kartEl.dataset.kod;
      if (e.target.closest('[data-ac]')){ if (await tasarimAc(kod)) sayfaKapat(); return; }
      if (e.target.closest('[data-begen]')){
        const b = e.target.closest('[data-begen]');
        try { const v = await istek(`/tasarimlar/${kod}/begen/`, {yontem: 'POST'}); b.querySelector('span').textContent = v.begeni_sayisi; b.classList.add('is-active'); }
        catch(err){ K().toast(err.message, 'hata'); }
      }
      if (e.target.closest('[data-sikayet]')) sikayetEt(kod);
      if (e.target.closest('[data-gizle]') && await yoneticiIslem(kod, 'gizle')) kartEl.remove();
      if (e.target.closest('[data-sil]') && await yoneticiIslem(kod, 'sil')) kartEl.remove();
    });
    yukle(true);
  }

  async function sikayetEt(kod){
    const neden = await K().dialog({baslik: 'Uygunsuz içerik bildir', genislik: 'dar', govde: `
      <p>Bu tasarımı neden bildiriyorsunuz? Birkaç bildirim alan tasarım galeriden kaldırılır ve yönetici inceler.</p>
      <label class="form full">Neden <small>(isteğe bağlı)</small><input id="gNeden" maxlength="200"></label>`,
      dugmeler: [{etiket: 'Vazgeç', deger: null}, {etiket: 'Bildir', tur: 'tehlike', kapatmaz: true, tikla: (b, kapat) => kapat($('#gNeden').value || '-')}]});
    if (neden === null) return;
    try { await istek(`/tasarimlar/${kod}/sikayet/`, {yontem: 'POST', govde: {neden: neden === '-' ? '' : neden}}); K().toast('Bildiriminiz alındı. Teşekkürler.', 'basari'); }
    catch(e){ K().toast(e.message, 'hata'); }
  }

  // Yalnız yönetici: sil (kalıcı) ya da gizle (listeden ve bağlantısından kalkar, veri durur)
  async function yoneticiIslem(kod, islem){
    const sil = islem === 'sil';
    if (!await K().onayla(sil
      ? {baslik: 'Tasarımı sil', metin: 'Tasarım galeriden ve bağlantısından kalıcı olarak silinir. Bu işlem geri alınamaz.', onay: 'Sil', tehlike: true}
      : {baslik: 'Tasarımı gizle', metin: 'Tasarım galeride görünmez, bağlantısı açılmaz. Veri silinmez.', onay: 'Gizle'})) return false;
    try {
      if (sil) await istek(`/tasarimlar/${kod}/`, {yontem: 'DELETE', yetkili: true});
      else await istek(`/moderasyon/${kod}/`, {yontem: 'POST', govde: {gizli: true}, yetkili: true});
      const k = kayitlarim(); if (k[kod]){ delete k[kod]; yaz(KAYITLARIM, k); }
      K().toast(sil ? 'Tasarım silindi' : 'Tasarım gizlendi', 'basari');
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
      <p>${t.sablon ? '<span class="galeri-rozet satir">Şablon</span> ' : ''}<b>${esc(t.yazar_adi || 'Adsız')}</b> · ${tarihYaz(t.olusturma)} · ${kok.ikon('heart', 14)} ${t.begeni_sayisi}</p>
      ${t.aciklama ? `<p class="galeri-aciklama">${esc(t.aciklama)}</p>` : ''}
      <p class="muted galeri-not">${sablon ? 'Şablon mevcut planınızın yerine açılır ve yeni tasarımınızın başlangıcı olur;' : 'Tasarım mevcut planınızın yerine açılır;'} «Geri al» (Ctrl Z) ile önceki planınıza dönebilirsiniz.${t.sahibi ? '' : ' Değişikliklerinizi «Paylaş» ile kendi tasarımınız olarak kaydedebilirsiniz.'}</p>`,
      dugmeler: [{etiket: 'Vazgeç', deger: null}, {etiket: sablon ? 'Bu şablonla başla' : 'Planı aç', tur: 'birincil'}]});
    if (!tamam) return false;
    const p = P();
    p.yukle(planTemizle(t.plan, {MATS: p.MATS, WALLS: p.WALLS, varsayilanMalzeme: id => p.ROOMS.find(r => r.id === id)?.mat || Object.keys(p.MATS)[0]}));
    // Şablondan başlanınca başlık boş: Paylaş yeni tasarım olarak kaydeder (kaynak = şablon)
    yaz(ACIK, sablon ? {kod: t.kod, baslik: '', kaynakBaslik: t.baslik}
                     : {kod: t.kod, baslik: t.baslik, yazar_adi: t.yazar_adi, aciklama: t.aciklama, sablon: t.sablon});
    p.baslik(sablon ? `«${t.baslik}» şablonundan` : t.baslik);
    return true;
  }

  // Plan sıfırlanınca / dosyadan yüklenince açık tasarım bağı kalkar (Paylaş yeni kayıt açar)
  disa.ayir = () => { try { localStorage.removeItem(ACIK); } catch(e) {} P()?.baslik(''); };

  async function basla(){
    const a = acikTasarim();
    if (a) P().baslik(a.baslik || (a.kaynakBaslik ? `«${a.kaynakBaslik}» şablonundan` : ''));
    let hazir = false;
    // Yalnız 200 yetmez: API'siz bir nginx /api/ yolunu index.html ile de yanıtlayabilir
    try { hazir = (await (await fetch(API + '/saglik/', {credentials: 'omit'})).json()).ok === true; } catch(e) {}
    if (!hazir) return;                          // API yayında değil: paylaşım özellikleri gizli kalır
    $('#galeriBtn').hidden = $('#paylasBtn').hidden = false;
    $('#galeriBtn').onclick = galeriAc;
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
