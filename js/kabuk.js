/* ============================================================
 *  tarus Tasarla — uygulama kabuğu
 *  tarus-standartlar.md'deki kabuk reçetelerinin düz JS karşılığı:
 *  toast (sağ üst, 4 sn), tarusDialog (Esc, odak tuzağı, odak geri dönüşü),
 *  açılır menüler, tema seçici, Hakkında penceresi, Pusula oturumu ve
 *  hata bildirimi köprüsü. "Pusula'ya aktar" penceresi (YH13) de burada.
 * ============================================================ */
(function (kok) {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

  /* ---------- Toast ---------- */
  const TOAST_IKON = {basari: 'circle-check', hata: 'circle-x', uyari: 'alert', bilgi: 'info'};
  function toast(metin, tur = 'bilgi', sure = 4000){
    const kutu = $('#tarus-toasts'); if (!kutu) return;
    const el = document.createElement('div');
    el.className = `tarus-toast ${TOAST_IKON[tur] ? tur : 'bilgi'}`;
    el.setAttribute('role', tur === 'hata' ? 'alert' : 'status');
    el.innerHTML = ikon(TOAST_IKON[tur] || 'info', 18) + `<span>${esc(metin)}</span>`;
    kutu.appendChild(el);
    while (kutu.children.length > 4) kutu.firstChild.remove();
    setTimeout(() => { el.classList.add('cikis'); setTimeout(() => el.remove(), 220); }, sure);
  }

  /* ---------- Diyalog ---------- */
  const ODAKLANABILIR = 'button:not([disabled]),[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
  /* dialog({baslik, govde: html, genislik: 'dar'|'genis', dugmeler: [{etiket, tur:'birincil'|'tehlike'|'', deger, kapatmaz}], acilis(el, kapat)})
   * → Promise<deger | null> (Esc / dışarı tıklama / X = null) */
  function dialog(o){
    return new Promise(coz => {
      const onceki = document.activeElement;
      const ov = document.createElement('div');
      ov.className = 'tarus-dialog-overlay';
      const id = 'dlg' + Math.random().toString(36).slice(2, 8);
      ov.innerHTML = `<div class="tarus-dialog ${o.genislik || ''}" role="dialog" aria-modal="true" aria-labelledby="${id}">
        <div class="tarus-dialog-header"><h2 id="${id}">${esc(o.baslik)}</h2><button class="dugme ikonlu" data-kapat aria-label="Kapat">${ikon('x')}</button></div>
        <div class="tarus-dialog-body">${o.govde || ''}</div>
        ${o.dugmeler?.length ? `<div class="tarus-dialog-footer">${o.dugmeler.map((d, i) => `<button class="dugme ${d.tur || ''}" data-i="${i}">${d.ikon ? ikon(d.ikon) : ''}${esc(d.etiket)}</button>`).join('')}</div>` : ''}
      </div>`;
      document.body.appendChild(ov);
      const kutu = ov.querySelector('.tarus-dialog');
      let bitti = false;
      const kapat = deger => {
        if (bitti) return; bitti = true;
        document.removeEventListener('keydown', tus, true);
        ov.remove();
        if (onceki && onceki.focus) onceki.focus();
        coz(deger);
      };
      const tus = e => {
        if (e.key === 'Escape'){ e.stopPropagation(); kapat(null); return; }
        if (e.key !== 'Tab') return;
        const el = [...kutu.querySelectorAll(ODAKLANABILIR)].filter(x => x.offsetParent !== null);
        if (!el.length) return;
        const ilk = el[0], son = el[el.length - 1];
        if (e.shiftKey && document.activeElement === ilk){ e.preventDefault(); son.focus(); }
        else if (!e.shiftKey && document.activeElement === son){ e.preventDefault(); ilk.focus(); }
      };
      document.addEventListener('keydown', tus, true);
      ov.addEventListener('pointerdown', e => { if (e.target === ov) kapat(null); });
      ov.querySelector('[data-kapat]').onclick = () => kapat(null);
      ov.querySelectorAll('.tarus-dialog-footer [data-i]').forEach(b => b.onclick = () => {
        const d = o.dugmeler[+b.dataset.i];
        if (d.kapatmaz){ d.tikla?.(b, kapat); return; }
        kapat(d.deger === undefined ? true : d.deger);
      });
      o.acilis?.(kutu, kapat);
      const odak = kutu.querySelector('[autofocus]') || kutu.querySelector('.tarus-dialog-footer .birincil, .tarus-dialog-footer .tehlike') || kutu.querySelector(ODAKLANABILIR);
      odak?.focus();
    });
  }
  const onayla = ({baslik, metin, onay = 'Tamam', tehlike = false}) => dialog({baslik, genislik: 'dar', govde: `<p>${esc(metin)}</p>`,
    dugmeler: [{etiket: 'Vazgeç', deger: false}, {etiket: onay, tur: tehlike ? 'tehlike' : 'birincil', deger: true}]}).then(Boolean);

  /* ---------- Açılır menüler ---------- */
  function menuBagla(tetikSec, popSec){
    const t = $(tetikSec), p = $(popSec);
    const ac = acik => {
      document.querySelectorAll('.popup.acik').forEach(x => { if (x !== p){ x.classList.remove('acik'); x.parentElement.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false'); x.parentElement.querySelector('.is-open')?.classList.remove('is-open'); } });
      p.classList.toggle('acik', acik); t.classList.toggle('is-open', acik); t.setAttribute('aria-expanded', String(acik));
    };
    t.addEventListener('click', e => { e.stopPropagation(); ac(!p.classList.contains('acik')); });
    p.addEventListener('click', e => { if (e.target.closest('.popup-oge, .tema-kart')) ac(false); });
    return ac;
  }
  document.addEventListener('pointerdown', e => {
    document.querySelectorAll('.popup.acik').forEach(p => { if (!p.parentElement.contains(e.target)){ p.classList.remove('acik'); p.parentElement.querySelector('.is-open')?.classList.remove('is-open'); } });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.popup.acik').forEach(p => { p.classList.remove('acik'); p.parentElement.querySelector('.is-open')?.classList.remove('is-open'); });
  });

  /* ---------- Tema seçici ---------- */
  function temaRenkleri(id){
    const prob = document.createElement('div');
    prob.className = 'theme-' + id; prob.style.display = 'none';
    document.body.appendChild(prob);
    const cs = getComputedStyle(prob), r = ['--bg', '--card', '--accent'].map(v => cs.getPropertyValue(v).trim());
    prob.remove();
    return r;
  }
  function temaIzgarasi(){
    $('#temaIzgara').innerHTML = TarusTema.TEMALAR.map(t => {
      const [bg, card, acc] = temaRenkleri(t.id);
      return `<button class="tema-kart ${t.id === TarusTema.aktif() ? 'is-active' : ''}" data-tema="${t.id}" title="${esc(t.aciklama)}">
        <span class="tema-karo"><i style="background:${bg}"></i><i style="background:${card}"></i><em style="background:${acc}"></em></span>
        ${ikon(t.ikon, 14)}<span>${esc(t.ad)}</span></button>`;
    }).join('');
    document.querySelectorAll('#temaIzgara [data-tema]').forEach(b => b.onclick = () => TarusTema.sec(b.dataset.tema));
  }
  TarusTema.degisince(() => { if ($('#temaIzgara')) temaIzgarasi(); });

  /* ---------- Hakkında ---------- */
  function hakkinda(){
    const S = TasarlaSurum;
    dialog({baslik: 'Hakkında', genislik: 'genis', govde: `<div class="hakkinda">
      <div class="kutu">
        <img class="rozet" src="public/icon.svg?v=1" alt="">
        <h3>tarus <span>Tasarla</span></h3>
        <div class="muted">Konut planını 2B ve 3B tasarlayın, tefrişi Türkiye'de yaygın ölçülerle yapın. Giriş gerekmez; planınız yalnız bu tarayıcıda saklanır.</div>
        <dl><dt>Uygulama</dt><dd>tarus Tasarla</dd><dt>Sürüm</dt><dd>${esc(S.APP_VERSION)}</dd><dt>İlk yayın</dt><dd>${esc(S.ILK_YAYIN)}</dd></dl>
        <ul><li>2B plan: mobilya yerleşimi, ölçü, duvar yıkma, döşeme seçimi</li><li>3B sahne: yörünge ve gezinti, gün ışığı ve gece</li>
          <li>Türkiye'de yaygın ölçülerle tefriş kütüphanesi (cm)</li><li>Mahal alanları ve döşeme maliyet tahmini (m², ₺)</li><li>PNG ve plan dosyası (JSON) olarak indirme</li></ul>
        <div class="gelistirici"><i>t</i><span>Geliştiren <a href="https://yazilim.tarus.tr" target="_blank" rel="noopener">tarus Yazılım</a><br><small>Açık kaynak (MIT): <a href="https://github.com/tarusatolye/tasarla" target="_blank" rel="noopener">kaynak kodu</a> · <a href="https://github.com/wy51ai/floorplan-3d" target="_blank" rel="noopener">floorplan-3d</a> üzerine</small></span></div>
      </div>
      <div class="kutu"><b>Sürüm notları</b>${S.SURUM_NOTLARI.map(n => `<div class="notlar-satir"><div><b>${esc(n.surum)}</b><small>${esc(n.tarih)}</small></div><div>${esc(n.not)}</div></div>`).join('')}</div>
    </div>`});
  }

  /* ---------- Pusula oturumu ve kullanıcı kartı ---------- */
  let kullanici = null;
  const basHarf = ad => String(ad || '?').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toLocaleUpperCase('tr');
  function kullaniciKarti(){
    const k = kullanici;
    const rozet = (id, boyut) => k?.avatar ? `<img class="avatar" id="${id}" src="${esc(k.avatar)}" alt="">`
      : `<span class="avatar" id="${id}">${k ? esc(basHarf(k.adSoyad)) : ikon('user', boyut)}</span>`;
    $('#kAvatar').outerHTML = rozet('kAvatar', 16);
    $('#kAvatar2').outerHTML = rozet('kAvatar2', 18);
    // Giriş gerekmez (herkese açık); Pusula bağlantısı yalnız tarus çalışanları için.
    $('#kAd').textContent = $('#kAd2').textContent = k ? k.adSoyad : 'Misafir';
    $('#kSirket').textContent = k ? (k.sirket || k.email) : 'Giriş gerekmez · plan bu tarayıcıda saklanır';
    $('#girisBtn').hidden = !!k; $('#cikisBtn').hidden = !k; $('#pusulaAc').hidden = !k;
    $('#pusulaAktar').hidden = !k;
  }
  // Açılış animasyonu (index.html, kabuk şablonu): en az 1 sn kalır, sonra 350 ms'de söner
  function yukleyiciKapat(){ if (kok.__tarusLoaderHide) kok.__tarusLoaderHide(); else $('#tarus-loader')?.remove(); }
  async function oturumuBaslat(){
    const {durum, hata} = await PusulaOturum.baslat();
    if (hata) toast(hata, 'uyari', 6000);
    if (durum === 'oturum'){
      const k = await PusulaOturum.kullanici();
      if (k.hata) toast(k.hata, 'uyari', 6000); else kullanici = k;
    }
    kullaniciKarti();
    yukleyiciKapat();
  }

  /* ---------- Hata bildirimi (sağ tık → Hata bildir) ----------
   * Pusula çerezleri yalnız pusula.tarus.tr'ye yazılır (host-only); çerezli varsayılan
   * form Tasarla'dan gönderemez. Bildirim bellekteki oturum belirteciyle gönderilir. */
  const DESTEK_EPOSTA = 'destek@tarus.tr';
  kok.__tarusOpenHataBildir = () => {
    let tur = 'bug';
    const misafirNotu = PusulaOturum.oturumVar() ? '' : `Bildiriminiz ${DESTEK_EPOSTA} adresine e-posta taslağı olarak hazırlanır.`;
    dialog({baslik: 'Hata / Fikir Bildir', govde: `<div class="sekmeler" id="fbTur"><button class="is-active" data-t="bug">${ikon('alert', 14)}Hata</button><button data-t="idea">${ikon('info', 14)}Fikir</button></div>
      <div class="form"><label class="full">Başlık<input id="fbBaslik" maxlength="200" autofocus></label><label class="full">Açıklama<textarea id="fbAciklama" rows="5"></textarea></label></div>
      <div class="not" id="fbNot">${esc(misafirNotu)}</div>`,
      dugmeler: [{etiket: 'Vazgeç', deger: null}, {etiket: 'Gönder', tur: 'birincil', kapatmaz: true, tikla: async (b, kapat) => {
        const baslik = $('#fbBaslik').value.trim(), aciklama = $('#fbAciklama').value.trim();
        if (!baslik || !aciklama){ $('#fbNot').textContent = 'Başlık ve açıklama zorunludur.'; return; }
        if (!PusulaOturum.oturumVar()){
          // Misafir: bildirim e-posta taslağı olarak açılır (Pusula hesabı gerekmez).
          const konu = `[Tasarla ${tur === 'idea' ? 'fikir' : 'hata'}] ${baslik}`;
          const metin = `${aciklama}\n\nSürüm: ${TasarlaSurum.APP_VERSION}\nTarayıcı: ${navigator.userAgent}`;
          location.href = `mailto:${DESTEK_EPOSTA}?subject=${encodeURIComponent(konu)}&body=${encodeURIComponent(metin)}`;
          kapat(true); toast('E-posta uygulamanızda bildirim taslağı açıldı.', 'bilgi');
          return;
        }
        b.disabled = true;
        try {
          const res = await PusulaOturum.authedFetch(PusulaOturum.PUSULA_URL + '/auth/feedbacks/', {method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({type: tur, title: baslik, module: document.title, description: aciklama,
              meta: {path: location.pathname + location.search, viewport: innerWidth + 'x' + innerHeight, userAgent: navigator.userAgent, app: location.hostname, surum: TasarlaSurum.APP_VERSION}})});
          if (!res.ok) throw new Error(`Bildirim gönderilemedi (${res.status})`);
          kapat(true); toast('Bildiriminiz iletildi. Teşekkürler.', 'basari');
        } catch (e) { b.disabled = false; $('#fbNot').textContent = e.message; }
      }}],
      acilis: kutu => kutu.querySelectorAll('#fbTur button').forEach(x => x.onclick = () => { tur = x.dataset.t; kutu.querySelectorAll('#fbTur button').forEach(y => y.classList.toggle('is-active', y === x)); }),
    });
  };
  /* Çizim alanında sağ tık düzenleyiciye aittir (3B'de sağ tuşla kaydırma); tarus menüsü
   * çizim alanı dışında çalışır. Pencere yakalama aşaması belge dinleyicisinden önce gelir. */
  addEventListener('contextmenu', e => { if (e.target.closest?.('#stage')) e.stopPropagation(); }, true);

  /* ---------- Pusula'ya aktar (YH13) ---------- */
  async function pusulayaAktar(){
    if (!PusulaOturum.oturumVar()){
      const git = await dialog({baslik: "Pusula'ya aktar", genislik: 'dar',
        govde: `<div class="durum-kutu">${ikon('alert', 18)}<div>Aktarım için Pusula oturumu gerekiyor. Pusula'ya bağlandıktan sonra bu sayfaya geri dönersiniz; planınız tarayıcıda kayıtlı kalır.</div></div>`,
        dugmeler: [{etiket: 'Vazgeç', deger: false}, {etiket: "Pusula'ya bağlan", tur: 'birincil', deger: true}]});
      if (git) PusulaOturum.yetkilendir();
      return;
    }
    const P = kok.TasarlaPlan, A = kok.PusulaAktar;
    const oz = A.planOzeti(P.state(), P.ROOMS, P.MATS, P.area, P.WALLS);
    const form = {tur: 'teklif', konu: P.planAdi(), musteri: '', malik: '', il: 'Samsun', ilce: '', mahalle: '', ada: '', parsel: '', projeId: null, projeAd: ''};
    const alan = (k, etiket, ek = '') => `<label class="${ek}">${etiket}<input data-k="${k}" value="${esc(form[k])}"><span class="hata" data-h="${k}"></span></label>`;
    const govde = `<div class="sekmeler" id="akTur">
        <button data-t="teklif" class="is-active">${ikon('file-text', 14)}Yeni teklif</button>
        <button data-t="proje">${ikon('briefcase', 14)}Yeni proje</button>
        <button data-t="mevcut">${ikon('folder', 14)}Mevcut projeye ekle</button></div>
      <div id="akForm"></div>
      <div class="onizleme"><h4>Pusula'ya gidecek özet</h4><pre id="akOzet"></pre></div>
      <div class="not" id="akAciklama"></div>`;
    const ciz = kutu => {
      const f = kutu.querySelector('#akForm'), t = form.tur;
      if (t === 'mevcut'){
        f.innerHTML = `<div class="form"><label class="full">Proje ara<input data-ara placeholder="Malik, ada/parsel ya da PRJ no" value=""></label></div>
          <span class="hata" data-h="projeId" style="color:var(--danger);font-size:var(--fs-xs)"></span><div class="proje-liste" id="akProjeler"><div class="muted">Yükleniyor...</div></div>`;
        const ara = async q => {
          const liste = kutu.querySelector('#akProjeler');
          try {
            const p = await A.projeAra(q);
            liste.innerHTML = p.length ? p.map(x => `<button class="proje-satir ${x.id === form.projeId ? 'is-active' : ''}" data-id="${esc(x.id)}" data-ad="${esc(x.ref_no || '')} ${esc(x.malik_display || x.malik || '')}">
              ${ikon('briefcase', 16)}<span><b>${esc(x.ref_no || '-')}</b> · ${esc(x.malik_display || x.malik || '')}<small>${esc([x.il, x.ilce, x.mahalle].filter(Boolean).join(' / '))}${x.ada ? ` · ${esc(x.ada)}/${esc(x.parsel || '')}` : ''}</small></span></button>`).join('')
              : '<div class="muted">Proje bulunamadı</div>';
            liste.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { form.projeId = b.dataset.id; form.projeAd = b.dataset.ad; liste.querySelectorAll('[data-id]').forEach(x => x.classList.toggle('is-active', x === b)); });
          } catch (e) { liste.innerHTML = `<div class="muted">${esc(e.message)}</div>`; }
        };
        let zm; f.querySelector('[data-ara]').oninput = e => { clearTimeout(zm); zm = setTimeout(() => ara(e.target.value.trim()), 300); };
        ara('');
      } else {
        f.innerHTML = `<div class="form">${alan('konu', 'Konu / plan adı', 'full')}${t === 'teklif' ? alan('musteri', 'Müşteri', 'full') : alan('malik', 'Malik', '') + alan('musteri', 'Müşteri (isteğe bağlı)', '')}
          ${alan('il', 'İl')}${alan('ilce', 'İlçe')}${alan('mahalle', 'Mahalle', 'full')}${alan('ada', 'Ada')}${alan('parsel', 'Parsel')}</div>`;
        f.querySelectorAll('input[data-k]').forEach(i => i.oninput = () => { form[i.dataset.k] = i.value; ozetYaz(kutu); });
      }
      kutu.querySelector('#akAciklama').textContent = t === 'teklif'
        ? 'Teklif Pusula\'da «Taslak» durumunda, sıradaki teklif numarasıyla açılır. Hizmet bedellerini Pusula\'da girersiniz; plan özeti teklif notuna yazılır.'
        : t === 'proje' ? 'Proje «Tasarım» kategorisinde açılır; Pusula proje klasörünü kurar. Plan görseli ve plan dosyası projenin 07 Belgeler klasörüne eklenir.'
        : 'Plan görseli ve plan dosyası seçilen projenin 07 Belgeler klasörüne yeni sürüm olarak eklenir.';
      ozetYaz(kutu);
    };
    const ozetYaz = kutu => { kutu.querySelector('#akOzet').textContent = A.ozetMetni(oz, form.konu || P.planAdi()); };
    const hatalariGoster = (kutu, h) => kutu.querySelectorAll('[data-h]').forEach(s => { s.textContent = h[s.dataset.h] || ''; kutu.querySelector(`input[data-k="${s.dataset.h}"]`)?.classList.toggle('gecersiz', !!h[s.dataset.h]); });

    const sonuc = await dialog({baslik: "Pusula'ya aktar", genislik: 'genis', govde,
      acilis: kutu => {
        kutu.querySelectorAll('#akTur button').forEach(b => b.onclick = () => { form.tur = b.dataset.t; kutu.querySelectorAll('#akTur button').forEach(x => x.classList.toggle('is-active', x === b)); ciz(kutu); });
        ciz(kutu);
      },
      dugmeler: [{etiket: 'Vazgeç', deger: null}, {etiket: 'Onayla ve aktar', ikon: 'send', tur: 'birincil', kapatmaz: true, tikla: async (b, kapat) => {
        const kutu = b.closest('.tarus-dialog'), h = A.formHatalari(form.tur, form);
        hatalariGoster(kutu, h);
        if (Object.keys(h).length) return;
        b.disabled = true; b.innerHTML = ikon('loader', 16, 'donen') + 'Aktarılıyor...';
        try { kapat(await aktar(oz, form)); }
        catch (e) { b.disabled = false; b.innerHTML = ikon('send') + 'Onayla ve aktar'; toast(e.message, 'hata', 6000); }
      }}],
    });
    if (sonuc) sonucGoster(sonuc);
  }

  async function planDosyalari(){
    const P = kok.TasarlaPlan;
    return {png: await P.pngBlob(), json: new Blob([JSON.stringify(P.state(), null, 2)], {type: 'application/json'})};
  }
  async function aktar(oz, form){
    const A = kok.PusulaAktar;
    if (form.tur === 'teklif'){
      const t = await A.teklifOlustur(oz, form);
      return {tur: 'teklif', baslik: `Teklif ${t.no} oluşturuldu`, metin: `${t.musteri} · ${t.konu}. Teklif «Taslak» durumunda; hizmet bedellerini Pusula'da girin.`, adres: `${PusulaOturum.PUSULA_URL}/teklifler`};
    }
    let projeId = form.projeId, ad = form.projeAd;
    if (form.tur === 'proje'){ const p = await A.projeOlustur(oz, form); projeId = p.id; ad = `${p.ref_no || ''} ${p.malik || ''}`.trim(); }
    const {png, json} = await planDosyalari(), uyari = [];
    try { if (png) await A.belgeYukle(projeId, png, 'tasarla-plan.png', 'tasarla_gorsel', 'Tasarla plan görseli', 'Tasarla_Plan_Gorseli'); } catch (e) { uyari.push('plan görseli: ' + e.message); }
    try { await A.belgeYukle(projeId, json, 'tasarla-plan.json', 'tasarla_plan', 'Tasarla plan dosyası', 'Tasarla_Plan'); } catch (e) { uyari.push('plan dosyası: ' + e.message); }
    return {tur: form.tur, baslik: form.tur === 'proje' ? `Proje ${ad} oluşturuldu` : `Plan ${ad} projesine eklendi`,
      metin: uyari.length ? `Kayıt tamam, ancak Arkiv'e yüklenemeyenler var (${uyari.join('; ')}).` : 'Plan görseli ve plan dosyası projenin 07 Belgeler klasörüne eklendi.',
      uyari: uyari.length > 0, adres: `${PusulaOturum.PUSULA_URL}/projeler`};
  }
  function sonucGoster(s){
    toast(s.baslik, s.uyari ? 'uyari' : 'basari');
    dialog({baslik: "Pusula'ya aktarıldı", genislik: 'dar', govde: `<div class="sonuc">${ikon(s.uyari ? 'alert' : 'circle-check', 40)}<b>${esc(s.baslik)}</b><div class="muted">${esc(s.metin)}</div></div>`,
      dugmeler: [{etiket: 'Kapat', deger: false}, {etiket: "Pusula'da aç", ikon: 'external', tur: 'birincil', deger: true}]})
      .then(ac => { if (ac) open(s.adres, '_blank', 'noopener'); });
  }

  /* ---------- Bağlama ---------- */
  function bagla(){
    ikonlariYerlestir();
    menuBagla('#temaBtn', '#temaPop'); menuBagla('#kullaniciBtn', '#kullaniciPop'); menuBagla('#dosyaBtn', '#dosyaPop');
    temaIzgarasi();
    $('#surumEtiketi').textContent = TasarlaSurum.APP_VERSION;
    $('#surumEtiketi').onclick = hakkinda; $('#hakkindaAc').onclick = hakkinda;
    $('#pusulaAc').onclick = () => open(PusulaOturum.PUSULA_URL, '_blank', 'noopener');
    $('#girisBtn').onclick = () => PusulaOturum.yetkilendir();
    $('#cikisBtn').onclick = async () => { if (await onayla({baslik: 'Oturumu kapat', metin: 'Pusula oturumunuz kapatılır. Planınız bu tarayıcıda kayıtlı kalır.', onay: 'Oturumu kapat', tehlike: true})) PusulaOturum.cikis(); };
    $('#pusulaAktar').onclick = pusulayaAktar;
    oturumuBaslat();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bagla); else bagla();

  kok.TarusKabuk = {toast, dialog, onayla, hakkinda, pusulayaAktar, kullanici: () => kullanici};
})(window);
