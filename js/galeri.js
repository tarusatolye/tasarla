/* ============================================================
 *  tarus Tasarla — tasarım kaydetme, bağlantıyla paylaşma ve galeri
 *
 *  Hesap yok (kullanıcı kararı 2026-10-06): kayıtta sunucu bir düzenleme
 *  anahtarı verir; anahtar yalnız bu tarayıcıda (localStorage) durur, aynı
 *  tasarımı güncellemek / silmek için gerekir. Başkasının tasarımı açılıp
 *  değiştirilirse "Paylaş" yeni bir tasarım (kopya) kaydeder.
 *
 *  Uçlar (api/, aynı alan adında /api/ altında):
 *    GET    /api/saglik/                  → API yoksa Galeri / Paylaş gizli kalır
 *    POST   /api/tasarimlar/              → kayıt, {kod, anahtar, …}
 *    GET    /api/tasarimlar/<kod>/        → plan + bilgiler
 *    PUT    /api/tasarimlar/<kod>/        → güncelleme (X-Tasarla-Anahtar)
 *    DELETE /api/tasarimlar/<kod>/        → silme (X-Tasarla-Anahtar)
 *    GET    /api/galeri/?sira=&sayfa=     → herkese açık liste
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
      galeride: !!form.galeride,
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

  async function istek(yol, {yontem = 'GET', govde, anahtar} = {}){
    const basliklar = {'Accept': 'application/json'};
    if (govde !== undefined) basliklar['Content-Type'] = 'application/json';
    if (anahtar) basliklar['X-Tasarla-Anahtar'] = anahtar;
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
        <label class="full onay"><input type="checkbox" id="gGaleride" ${acik && benim && acik.galeride === false ? '' : 'checked'}> Galeride herkes görsün</label>
        <input id="gWeb" class="bal-kupu" tabindex="-1" autocomplete="off" aria-hidden="true">
      </form>
      <p class="muted galeri-not">${benim ? 'Bu tasarımı daha önce bu tarayıcıdan kaydettiniz; «Güncelle» aynı bağlantıyı korur.' : acik ? `«${esc(acik.baslik)}» üzerine kurduğunuz plan yeni bir tasarım olarak kaydedilir.` : 'Hesap gerekmez. Kayıttan sonra bağlantıyı paylaşabilirsiniz; tasarımı yalnız bu tarayıcıdan güncelleyip silebilirsiniz.'}</p>`;
    const dugmeler = [{etiket: 'Vazgeç', deger: null}];
    const gonder = yeni => async (b, kapat) => {
      const form = {baslik: $('#gBaslik').value, yazar_adi: $('#gYazar').value, aciklama: $('#gAciklama').value,
                    galeride: $('#gGaleride').checked, web_sitesi: $('#gWeb').value};
      if (!form.baslik.trim()){ $('#gBaslik').focus(); return K().toast('Başlık gerekli', 'uyari'); }
      b.disabled = true;
      try {
        const g = kayitGovdesi(P().state(), form, await onizlemeUret(), !benim && acik ? acik.kod : '');
        const sonuc = yeni ? await istek('/tasarimlar/', {yontem: 'POST', govde: g})
                           : await istek(`/tasarimlar/${acik.kod}/`, {yontem: 'PUT', govde: g, anahtar: benim.anahtar});
        const k = kayitlarim();
        k[sonuc.kod] = {anahtar: yeni ? sonuc.anahtar : benim.anahtar, baslik: sonuc.baslik, tarih: sonuc.guncelleme};
        yaz(KAYITLARIM, k);
        yaz(ACIK, {kod: sonuc.kod, baslik: sonuc.baslik, yazar_adi: sonuc.yazar_adi, aciklama: sonuc.aciklama, galeride: sonuc.galeride});
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
      <p>${t.galeride ? 'Tasarımınız galeride herkese görünür.' : 'Tasarımınız yalnız bağlantıyı bilenlere açık.'} Bağlantı:</p>
      <div class="galeri-baglanti"><input id="gAdres" readonly value="${esc(adres)}"><button class="dugme" id="gKopyala">${kok.ikon('copy')}Kopyala</button></div>
      <p class="muted galeri-not">Düzenleme anahtarı bu tarayıcıda saklanır. Tarayıcı verisini silerseniz tasarımı artık güncelleyemezsiniz; bağlantı çalışmaya devam eder.</p>`,
      dugmeler: [{etiket: 'Tamam', tur: 'birincil'}],
      acilis: kutu => {
        kutu.querySelector('#gKopyala').onclick = async () => {
          try { await navigator.clipboard.writeText(adres); K().toast('Bağlantı kopyalandı', 'basari'); }
          catch(e){ kutu.querySelector('#gAdres').select(); }
        };
      }});
  }

  /* ---------- Galeri ---------- */
  function kart(t, benim){
    return `<article class="galeri-kart" data-kod="${esc(t.kod)}">
      <button class="galeri-gorsel" data-ac title="Tasarımı aç">${t.onizleme ? `<img src="${esc(t.onizleme)}" alt="" loading="lazy">` : kok.ikon('image')}</button>
      <div class="galeri-bilgi">
        <b title="${esc(t.baslik)}">${esc(t.baslik)}</b>
        <small>${esc(t.yazar_adi || 'Adsız')} · ${tarihYaz(t.olusturma)}</small>
      </div>
      <div class="galeri-eylem">
        <button class="dugme kucuk" data-begen title="Beğen" aria-label="Beğen: ${t.begeni_sayisi}">${kok.ikon('heart', 14)}<span>${t.begeni_sayisi}</span></button>
        <button class="dugme kucuk birincil" data-ac>Aç</button>
        ${benim ? `<button class="dugme kucuk tehlike" data-sil title="Tasarımı sil" aria-label="Tasarımı sil">${kok.ikon('trash', 14)}</button>`
                : `<button class="dugme kucuk" data-sikayet title="Uygunsuz içerik bildir" aria-label="Uygunsuz içerik bildir">${kok.ikon('flag', 14)}</button>`}
      </div>
    </article>`;
  }

  async function galeriAc(){
    let sira = 'yeni', sonraki = 1, kutuEl = null;
    const yukle = async (sifirla) => {
      const liste = kutuEl.querySelector('#galeriListe'), daha = kutuEl.querySelector('#galeriDaha');
      if (sifirla){ sonraki = 1; liste.innerHTML = `<div class="galeri-bos">${kok.ikon('loader')} Yükleniyor…</div>`; }
      daha.hidden = true;
      try {
        const v = await istek(`/galeri/?sira=${sira}&sayfa=${sonraki}`);
        const k = kayitlarim();
        if (sifirla) liste.innerHTML = '';
        liste.insertAdjacentHTML('beforeend', v.sonuclar.map(t => kart(t, !!k[t.kod])).join(''));
        if (!liste.children.length) liste.innerHTML = '<div class="galeri-bos">Galeride henüz tasarım yok. İlk paylaşan siz olun.</div>';
        sonraki = v.sonraki; daha.hidden = !sonraki;
      } catch(e){ liste.innerHTML = `<div class="galeri-bos">${esc(e.message)}</div>`; }
    };
    const benimkiler = Object.entries(kayitlarim());
    await K().dialog({baslik: 'Galeri', genislik: 'genis', govde: `
      <div class="galeri-ust">
        <div class="tarus-toolbar-segment" role="tablist">
          <button class="tarus-toolbar-segment-button btn is-active" data-sira="yeni" role="tab" aria-selected="true">En yeni</button>
          <button class="tarus-toolbar-segment-button btn" data-sira="begeni" role="tab" aria-selected="false">En beğenilen</button>
        </div>
        ${benimkiler.length ? `<small class="muted">Bu tarayıcıdan paylaştığınız: ${benimkiler.length}</small>` : ''}
      </div>
      <div class="galeri-izgara" id="galeriListe"></div>
      <div class="galeri-alt"><button class="dugme" id="galeriDaha" hidden>Daha fazla göster</button></div>`,
      acilis: (kutu, kapat) => {
        kutuEl = kutu;
        kutu.querySelectorAll('[data-sira]').forEach(b => b.onclick = () => {
          sira = b.dataset.sira;
          kutu.querySelectorAll('[data-sira]').forEach(x => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-selected', String(x === b)); });
          yukle(true);
        });
        kutu.querySelector('#galeriDaha').onclick = () => yukle(false);
        kutu.querySelector('#galeriListe').addEventListener('click', async e => {
          const kartEl = e.target.closest('.galeri-kart'); if (!kartEl) return;
          const kod = kartEl.dataset.kod;
          if (e.target.closest('[data-ac]')){ kapat(null); return tasarimAc(kod); }
          if (e.target.closest('[data-begen]')){
            const b = e.target.closest('[data-begen]');
            try { const v = await istek(`/tasarimlar/${kod}/begen/`, {yontem: 'POST'}); b.querySelector('span').textContent = v.begeni_sayisi; b.classList.add('is-active'); }
            catch(err){ K().toast(err.message, 'hata'); }
          }
          if (e.target.closest('[data-sikayet]')) sikayetEt(kod);
          if (e.target.closest('[data-sil]') && await tasarimSil(kod)) kartEl.remove();
        });
        yukle(true);
      }});
  }

  async function sikayetEt(kod){
    const neden = await K().dialog({baslik: 'Uygunsuz içerik bildir', genislik: 'dar', govde: `
      <p>Bu tasarımı neden bildiriyorsunuz? Birkaç bildirim alan tasarım galeriden kaldırılır ve incelenir.</p>
      <label class="form full">Neden <small>(isteğe bağlı)</small><input id="gNeden" maxlength="200"></label>`,
      dugmeler: [{etiket: 'Vazgeç', deger: null}, {etiket: 'Bildir', tur: 'tehlike', kapatmaz: true, tikla: (b, kapat) => kapat($('#gNeden').value || '-')}]});
    if (neden === null) return;
    try { await istek(`/tasarimlar/${kod}/sikayet/`, {yontem: 'POST', govde: {neden: neden === '-' ? '' : neden}}); K().toast('Bildiriminiz alındı. Teşekkürler.', 'basari'); }
    catch(e){ K().toast(e.message, 'hata'); }
  }

  async function tasarimSil(kod){
    const k = kayitlarim(); if (!k[kod]) return false;
    if (!await K().onayla({baslik: 'Tasarımı sil', metin: `«${k[kod].baslik}» galeriden ve bağlantısından kalıcı olarak kaldırılır. Planınız bu tarayıcıda kalır.`, onay: 'Sil', tehlike: true})) return false;
    try {
      await istek(`/tasarimlar/${kod}/`, {yontem: 'DELETE', anahtar: k[kod].anahtar});
      delete k[kod]; yaz(KAYITLARIM, k);
      if (acikTasarim()?.kod === kod){ try { localStorage.removeItem(ACIK); } catch(e) {} P().baslik(''); }
      K().toast('Tasarım silindi', 'basari');
      return true;
    } catch(e){ K().toast(e.message, 'hata'); return false; }
  }

  /* ---------- Bağlantıdan açma ---------- */
  async function tasarimAc(kod){
    let t;
    try { t = await istek(`/tasarimlar/${encodeURIComponent(kod)}/`, {anahtar: kayitlarim()[kod]?.anahtar}); }
    catch(e){ return K().toast(e.message, 'hata'); }
    const tamam = await K().dialog({baslik: t.baslik, govde: `
      ${t.onizleme ? `<img class="galeri-buyuk" src="${esc(t.onizleme)}" alt="">` : ''}
      <p><b>${esc(t.yazar_adi || 'Adsız')}</b> · ${tarihYaz(t.olusturma)} · ${kok.ikon('heart', 14)} ${t.begeni_sayisi}</p>
      ${t.aciklama ? `<p class="galeri-aciklama">${esc(t.aciklama)}</p>` : ''}
      <p class="muted galeri-not">Tasarım mevcut planınızın yerine açılır; «Geri al» (Ctrl Z) ile önceki planınıza dönebilirsiniz.${t.sahibi ? '' : ' Değişikliklerinizi «Paylaş» ile kendi tasarımınız olarak kaydedebilirsiniz.'}</p>`,
      dugmeler: [{etiket: 'Vazgeç', deger: null}, {etiket: 'Planı aç', tur: 'birincil'}]});
    if (!tamam) return;
    const p = P();
    p.yukle(planTemizle(t.plan, {MATS: p.MATS, WALLS: p.WALLS, varsayilanMalzeme: id => p.ROOMS.find(r => r.id === id)?.mat || Object.keys(p.MATS)[0]}));
    yaz(ACIK, {kod: t.kod, baslik: t.baslik, yazar_adi: t.yazar_adi, aciklama: t.aciklama, galeride: t.galeride});
    p.baslik(t.baslik);
  }

  // Plan sıfırlanınca / dosyadan yüklenince açık tasarım bağı kalkar (Paylaş yeni kayıt açar)
  disa.ayir = () => { try { localStorage.removeItem(ACIK); } catch(e) {} P()?.baslik(''); };

  async function basla(){
    const a = acikTasarim();
    if (a) P().baslik(a.baslik);
    let hazir = false;
    try { hazir = (await fetch(API + '/saglik/', {credentials: 'omit'})).ok; } catch(e) {}
    if (!hazir) return;                          // API yayında değil: paylaşım özellikleri gizli kalır
    $('#galeriBtn').hidden = $('#paylasBtn').hidden = false;
    $('#galeriBtn').onclick = galeriAc;
    $('#paylasBtn').onclick = paylas;
    const kod = new URLSearchParams(location.search).get('t');
    if (kod){
      history.replaceState(null, '', location.pathname);   // yenilemede yeniden sorulmasın
      tasarimAc(kod);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', basla); else basla();
})(typeof window !== 'undefined' ? window : globalThis);
