/* ============================================================
 *  tarus Tasarla — planı Pusula teklif / proje kaydına dönüştürme (YH13)
 *
 *  Karar (ozluk/tarus.md §4.2 "Veri girişi"): Pusula'ya veri koddan girilmez.
 *  Kayıt yalnız kullanıcı "Pusula'ya aktar" penceresinde önizlemeyi görüp
 *  onayladığında, kendi Pusula oturumuyla ve Pusula'nın normal API'si
 *  üzerinden oluşur; doğrulama, yetki, şirket kapsamı ve işlem kaydı
 *  Pusula'da kalır.
 *
 *  Kullanılan uçlar (pusula/Backend):
 *    GET  /teklifler/                         → sonraki teklif no (TKL-YYYY-NNN)
 *    POST /teklifler/                         → teklif (durum Taslak)
 *    GET  /projects/?search=                  → mevcut proje seçimi
 *    POST /projects/                          → proje (kategori Tasarım)
 *    POST /arkiv/projects/<id>/documents/     → plan görseli + plan dosyası projenin 07 Belgeler klasörüne
 *
 *  Saf fonksiyonlar (planOzeti, ...Govdesi) tarayıcısız test edilir: testler/.
 * ============================================================ */
(function (kok) {
  const yuvarla = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  const tlYaz = n => Math.round(n).toLocaleString('tr-TR') + ' ₺';
  const m2Yaz = n => n.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' m²';

  /* Takvim günü 'YYYY-MM-DD' (yerel saat; toISOString UTC'ye kaydırır, kullanılmaz) */
  function gun(d = new Date(), ekle = 0){
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + ekle);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }

  /* Plan → özet. alanFn(poly) m² döndürür (index.html'deki area). */
  function planOzeti(state, ROOMS, MATS, alanFn, WALLS = []){
    const mahaller = ROOMS.map(r => {
      const st = state.rooms[r.id] || {name: r.name, mat: r.mat};
      const alan = alanFn(r.poly), m = MATS[st.mat] || {name: '-', price: 0};
      return {id: r.id, ad: st.name, alan: yuvarla(alan), hamAlan: alan, sayilir: r.counted !== false, malzeme: m.name,
        birimFiyat: m.price, maliyet: Math.round(alan * m.price * 1.05)};
    });
    // Toplam ham alanlardan yuvarlanır (ekrandaki "Net kullanım alanı" ile aynı sonuç)
    const netAlan = yuvarla(mahaller.filter(m => m.sayilir).reduce((a, m) => a + m.hamAlan, 0));
    mahaller.forEach(m => delete m.hamAlan);
    const dosemeToplam = mahaller.reduce((a, m) => a + m.maliyet, 0);
    const grup = new Map();
    state.furniture.forEach(f => {
      const ad = String(f.name || f.type).trim(), olcu = `${Math.round(f.w / 10)}×${Math.round(f.d / 10)} cm`, k = ad + '|' + olcu;
      const g = grup.get(k) || {ad, olcu, adet: 0}; g.adet++; grup.set(k, g);
    });
    const mobilyalar = [...grup.values()].sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
    const yikilanDuvarM = yuvarla(state.demolished.map(id => WALLS[+String(id).slice(1)]).filter(Boolean)
      .reduce((a, w) => a + Math.max(w[2] - w[0], w[3] - w[1]), 0) / 1000, 1);
    return {netAlan, mahaller, dosemeToplam, mobilyalar, mobilyaAdedi: state.furniture.length, yikilanDuvarM};
  }

  /* Teklif notu / proje açıklaması için düz metin özet */
  function ozetMetni(oz, planAdi){
    const satir = [];
    satir.push(`tarus Tasarla planı: ${planAdi}`);
    satir.push(`Net kullanım alanı: ${m2Yaz(oz.netAlan)}`);
    satir.push('', 'Mahaller:');
    oz.mahaller.forEach(m => satir.push(`- ${m.ad}: ${m2Yaz(m.alan)}${m.sayilir ? '' : ' (alana katılmaz)'} · ${m.malzeme}`));
    satir.push('', `Döşeme tahmini (%5 fire dahil, örnek birim fiyatlarla): ${tlYaz(oz.dosemeToplam)}`);
    if (oz.yikilanDuvarM > 0) satir.push(`Yıkılacak duvar: ${oz.yikilanDuvarM.toLocaleString('tr-TR')} m`);
    satir.push('', `Mobilya ve donatı (${oz.mobilyaAdedi} adet):`);
    oz.mobilyalar.forEach(m => satir.push(`- ${m.adet} × ${m.ad} (${m.olcu})`));
    return satir.join('\n');
  }

  /* Pusula ön yüzündeki nextTeklifNo ile aynı kural (TekliflerManagement.tsx) */
  function sonrakiTeklifNo(liste, bugun = new Date()){
    const nums = (liste || []).map(t => { const m = String(t.no || '').match(/TKL-\d{4}-(\d+)/); return m ? parseInt(m[1], 10) : 0; }).filter(n => n > 0);
    const sonraki = nums.length ? Math.max(...nums) + 1 : 1;
    return `TKL-${bugun.getFullYear()}-${String(sonraki).padStart(3, '0')}`;
  }

  const kirp = (v, n) => String(v ?? '').trim().slice(0, n);

  /* POST /teklifler/ gövdesi. Hizmet bedelleri (kalemler) Pusula'da girilir: plan
   * mimari hizmet bedeli üretmez; döşeme tahmini yalnız notta bilgi olarak geçer. */
  function teklifGovdesi(oz, form, no, bugun = new Date()){
    return {
      no, musteri: kirp(form.musteri, 255), konu: kirp(form.konu, 255),
      il: kirp(form.il, 100), ilce: kirp(form.ilce, 100), mahalle: kirp(form.mahalle, 100),
      ada: kirp(form.ada, 50), parsel: kirp(form.parsel, 50), proje_turu: 'İç mimari / tefriş',
      insaat_alani: oz.netAlan, kalemler: {}, kdv: 20, tarih: gun(bugun), gecerlilik: gun(bugun, 30),
      durum: 'Taslak', notlar: ozetMetni(oz, form.konu),
    };
  }

  /* POST /projects/ gövdesi. Zorunlu: il, ilce, mahalle, category, malik */
  function projeGovdesi(oz, form){
    return {
      il: kirp(form.il, 100), ilce: kirp(form.ilce, 100) || '-', mahalle: kirp(form.mahalle, 100) || '-',
      category: 'Tasarım', malik: kirp(form.malik || form.musteri, 255), musteri: kirp(form.musteri, 255),
      ada: kirp(form.ada, 50), parsel: kirp(form.parsel, 50), insaat_alani: oz.netAlan,
      kategori_alanlari: {kaynak: 'tarus Tasarla', tasarla_plan: kirp(form.konu, 200), tasarla_net_alan_m2: oz.netAlan,
        tasarla_mobilya_adedi: oz.mobilyaAdedi, tasarla_doseme_tahmini_tl: oz.dosemeToplam},
    };
  }

  function formHatalari(tur, form){
    const h = {};
    if (tur === 'teklif'){
      if (!kirp(form.musteri, 255)) h.musteri = 'Müşteri adı zorunlu';
      if (!kirp(form.konu, 255)) h.konu = 'Konu zorunlu';
    }
    if (tur === 'proje'){
      if (!kirp(form.il, 100)) h.il = 'İl zorunlu';
      if (!kirp(form.malik || form.musteri, 255)) h.malik = 'Malik zorunlu';
    }
    if (tur === 'mevcut' && !form.projeId) h.projeId = 'Bir proje seçin';
    return h;
  }

  /* DRF hata gövdesini okunur metne çevirir */
  async function hataMetni(res){
    let d = null; try { d = await res.json(); } catch (e) {}
    if (res.status === 403) return d?.detail || 'Bu işlem için Pusula yetkiniz yok.';
    if (d && typeof d === 'object'){
      if (d.detail) return String(d.detail);
      const ilk = Object.entries(d)[0];
      if (ilk) return `${ilk[0]}: ${Array.isArray(ilk[1]) ? ilk[1].join(' ') : ilk[1]}`;
    }
    return `Pusula isteği başarısız (${res.status})`;
  }

  /* ---------- API (PusulaOturum.authedFetch ile) ---------- */
  const api = (yol, init) => kok.PusulaOturum.authedFetch(kok.PusulaOturum.PUSULA_URL + yol, init);
  const json = (method, govde) => ({method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(govde)});

  async function teklifOlustur(oz, form){
    const lr = await api('/teklifler/');
    if (!lr.ok) throw new Error(await hataMetni(lr));
    const liste = await lr.json();
    const no = sonrakiTeklifNo(Array.isArray(liste) ? liste : liste.results);
    const res = await api('/teklifler/', json('POST', teklifGovdesi(oz, form, no)));
    if (!res.ok) throw new Error(await hataMetni(res));
    return res.json();
  }

  async function projeOlustur(oz, form){
    const res = await api('/projects/', json('POST', projeGovdesi(oz, form)));
    if (!res.ok) throw new Error(await hataMetni(res));
    return res.json();
  }

  async function projeAra(q){
    const res = await api('/projects/?page=1&page_size=20' + (q ? '&search=' + encodeURIComponent(q) : ''));
    if (!res.ok) throw new Error(await hataMetni(res));
    const d = await res.json();
    return Array.isArray(d) ? d : (d.results || []);
  }

  /* Plan dosyasını projenin Arkiv'ine belge olarak yükler (aynı anahtarla sürüm artar) */
  async function belgeYukle(projeId, blob, dosyaAdi, anahtar, etiket, ek){
    const fd = new FormData();
    fd.append('file', blob, dosyaAdi);
    fd.append('document_key', anahtar); fd.append('document_label', etiket); fd.append('document_suffix', ek);
    const res = await api(`/arkiv/projects/${encodeURIComponent(projeId)}/documents/`, {method: 'POST', body: fd});
    if (!res.ok) throw new Error(await hataMetni(res));
    return res.json();
  }

  const disa = {planOzeti, ozetMetni, sonrakiTeklifNo, teklifGovdesi, projeGovdesi, formHatalari, gun,
    teklifOlustur, projeOlustur, projeAra, belgeYukle};
  kok.PusulaAktar = disa;
  if (typeof module !== 'undefined') module.exports = disa;
})(typeof window !== 'undefined' ? window : globalThis);
