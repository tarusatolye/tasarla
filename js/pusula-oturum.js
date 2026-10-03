/* ============================================================
 *  tarus Tasarla — Pusula SSO oturumu
 *
 *  Tasarla bir Ekosistem uygulamasıdır (ozluk/tarus.md §5.1, karar 2026-10-02):
 *  ayrı kullanıcı sistemi yok, giriş Pusula SSO ile. Akış YH1 ortak paketi
 *  ozluk/tarus-kabuk/services/pusulaOturumu.ts ile aynıdır; o dosya TypeScript
 *  olduğu ve Tasarla'da derleme adımı olmadığı için birebir kopyalanamıyor, bu
 *  dosya onun düz JS karşılığıdır (paket değişirse burası da güncellenir).
 *  Tek bilinçli fark: localhost'ta otomatik yönlendirme yok (aşağıda).
 *
 *  1. URL'de ?sso_code= varsa /auth/sso/exchange/ ile access + refresh'e çevrilir.
 *  2. Belirteçler YALNIZCA BELLEKTE tutulur (localStorage/çerez yok).
 *  3. Belirteç yoksa pusula.tarus.tr/auth/sso/authorize/?return=<adres>'e gidilir.
 *  4. 401'de bellekteki refresh ile /auth/refresh/ denenir, olmazsa yeniden yetkilendirilir.
 *  Yerel geliştirmede (localhost) otomatik yönlendirme yapılmaz: uygulama
 *  "yerel" modda açılır, Pusula işlemleri "Pusula'ya bağlan" ile başlatılır.
 * ============================================================ */
(function (kok) {
  const PUSULA_URL = 'https://pusula.tarus.tr';
  const MOBIL = {'X-Client': 'mobile'};   // Pusula belirteçleri gövdede döndürür
  const nativeFetch = (...a) => kok.fetch(...a);

  let access = null, refresh = null, inflight = null;
  const yerelMi = () => ['localhost', '127.0.0.1'].includes(location.hostname) || location.protocol === 'file:';
  const kanal = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tasarla-auth') : null;
  if (kanal) kanal.onmessage = e => { if (e.data?.type === 'REFRESH_DONE' && e.data.access){ access = e.data.access; if (e.data.refresh) refresh = e.data.refresh; } };
  const yay = () => kanal?.postMessage({type:'REFRESH_DONE', access, refresh});

  function jwtExp(t){
    try { const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return typeof p.exp === 'number' ? p.exp : null; }
    catch (e) { return null; }
  }
  const suresiDolmus = (t, pay = 60) => { const exp = jwtExp(t); return exp === null || exp - pay < Date.now() / 1000; };

  function yenile(){
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        if (!refresh) return false;
        const res = await nativeFetch(`${PUSULA_URL}/auth/refresh/`, {method:'POST', headers:{'Content-Type':'application/json', ...MOBIL},
          body: JSON.stringify({refresh, refresh_token: refresh})});
        if (!res.ok) return false;
        const d = await res.json();
        if (!d?.access) return false;
        access = d.access; if (d.refresh) refresh = d.refresh; yay();
        return true;
      } catch (e) { return false; }
      finally { setTimeout(() => { inflight = null; }, 0); }
    })();
    return inflight;
  }

  async function kodTakas(code){
    try {
      const res = await nativeFetch(`${PUSULA_URL}/auth/sso/exchange/`, {method:'POST', headers:{'Content-Type':'application/json', ...MOBIL}, body: JSON.stringify({code})});
      if (!res.ok){ let detay = ''; try { detay = (await res.json())?.detail || ''; } catch (e) {} return {ok:false, hata: detay || `Pusula oturum takası başarısız (${res.status})`}; }
      const d = await res.json();
      if (!d?.access) return {ok:false, hata:'Pusula oturum anahtarı döndürmedi.'};
      access = d.access; if (d.refresh) refresh = d.refresh; yay();
      return {ok:true};
    } catch (e) { return {ok:false, hata: e?.message || 'Ağ hatası'}; }
  }

  function yetkilendir(){
    access = refresh = null;
    location.replace(`${PUSULA_URL}/auth/sso/authorize/?return=${encodeURIComponent(location.href)}`);
  }

  /* Açılışta çağrılır. Dönüş: 'oturum' (giriş var) | 'yerel' (localhost, girişsiz) | 'yonlendiriliyor' */
  async function baslat(){
    const q = new URLSearchParams(location.search);
    // Eski yetki SSO'su (?token=<jwt>) kullanılmıyor; adres çubuğunda kalmasın
    if (q.has('token')){ q.delete('token'); const t = q.toString(); history.replaceState({}, document.title, location.pathname + (t ? `?${t}` : '') + location.hash); }
    const code = q.get('sso_code');
    if (code){
      const r = await kodTakas(code);
      q.delete('sso_code');
      const temiz = q.toString();
      history.replaceState({}, document.title, location.pathname + (temiz ? `?${temiz}` : '') + location.hash);
      if (r.ok) return 'oturum';
      if (!yerelMi()){ yetkilendir(); return 'yonlendiriliyor'; }
    }
    if (access && !suresiDolmus(access)) return 'oturum';
    if (refresh && await yenile()) return 'oturum';
    if (yerelMi()) return 'yerel';
    yetkilendir();
    return 'yonlendiriliyor';
  }

  async function authedFetch(url, init = {}){
    const opts = {...init, headers:{...(init.headers || {})}};
    if (access) opts.headers.Authorization = `Bearer ${access}`;
    let res = await nativeFetch(url, opts);
    if (res.status !== 401) return res;
    if (!(await yenile())){ yetkilendir(); throw new Error('Oturum süresi doldu; Pusula girişine yönlendiriliyor'); }
    opts.headers.Authorization = `Bearer ${access}`;
    res = await nativeFetch(url, opts);
    if (res.status === 401){ yetkilendir(); throw new Error('Oturum yenilendi fakat istek yine 401 döndü'); }
    return res;
  }

  /* /auth/me/ → {id, email, adSoyad, avatar, sirket, sirketId, rol} ya da {hata, durum} */
  async function kullanici(){
    try {
      const res = await authedFetch(`${PUSULA_URL}/auth/me/`);
      if (!res.ok){
        let d = null; try { d = await res.json(); } catch (e) {}
        return {hata: res.status === 403 && d?.code === 'password_change_required'
          ? 'Pusula şifrenizi değiştirmeniz gerekiyor.' : (d?.detail || `Pusula kullanıcı bilgisi alınamadı (${res.status})`), durum: res.status};
      }
      const d = await res.json();
      let avatar = d.avatar_url || d.avatar || d.profile?.avatar_url || '';
      if (avatar.startsWith('/')) avatar = PUSULA_URL + avatar;
      return {id: d.id, email: d.email || '', adSoyad: d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim() || d.username || 'Pusula kullanıcısı',
        avatar, sirket: d.company_name || d.company?.name || '', sirketId: d.company_id || null, rol: d.role || ''};
    } catch (e) { return {hata: e?.message || 'Pusula\'ya ulaşılamadı', durum: 0}; }
  }

  async function cikis(){
    try {
      if (refresh) await nativeFetch(`${PUSULA_URL}/auth/cikis/`, {method:'POST', headers:{'Content-Type':'application/json', ...MOBIL},
        body: JSON.stringify({refresh, refresh_token: refresh})});
    } catch (e) { /* yoksay */ }
    access = refresh = null;
    location.replace(`${PUSULA_URL}/auth/cikis/`);
  }

  kok.__tasarlaGetAccessToken = () => access;   // bağlam menüsü / harici yardımcılar için
  kok.PusulaOturum = {PUSULA_URL, baslat, authedFetch, kullanici, cikis, yetkilendir, oturumVar: () => !!access, yerelMi,
    belirtec: () => access};
})(window);
