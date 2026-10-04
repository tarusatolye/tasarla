/* ============================================================
 *  tarus Tasarla — Pusula SSO oturumu
 *
 *  Tasarla herkese açık bir uygulamadır (kullanıcı kararı 2026-10-04: açık kaynak,
 *  müşterilerle paylaşılır, giriş istemez). Pusula bağlantısı isteğe bağlıdır ve
 *  yalnız tarus çalışanlarının planı Pusula'ya aktarması içindir. Akış YH1 ortak
 *  paketi ozluk/tarus-kabuk/services/pusulaOturumu.ts ile aynıdır; o dosya
 *  TypeScript olduğu ve Tasarla'da derleme adımı olmadığı için birebir
 *  kopyalanamıyor, bu dosya onun düz JS karşılığıdır.
 *  Bilinçli fark: hiçbir durumda kendiliğinden Pusula'ya yönlendirmez.
 *
 *  1. URL'de ?sso_code= varsa /auth/sso/exchange/ ile access + refresh'e çevrilir.
 *  2. Belirteçler YALNIZCA BELLEKTE tutulur (localStorage/çerez yok).
 *  3. Belirteç yoksa uygulama misafir olarak açılır; Pusula'ya yalnız kullanıcı isterse gidilir.
 *  4. 401'de bellekteki refresh ile /auth/refresh/ denenir; olmazsa oturum düşer, hata döner.
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

  /* Açılışta çağrılır. Tasarla herkese açıktır (kullanıcı kararı 2026-10-04): giriş
   * istenmez, Pusula'ya kendiliğinden yönlendirilmez. Pusula bağlantısı yalnız tarus
   * çalışanlarının "Pusula ile bağlan" demesiyle (dönüşte ?sso_code) kurulur.
   * Dönüş: {durum: 'oturum' | 'misafir', hata?} */
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
      if (r.ok) return {durum: 'oturum'};
      return {durum: 'misafir', hata: r.hata};
    }
    if (access && !suresiDolmus(access)) return {durum: 'oturum'};
    if (refresh && await yenile()) return {durum: 'oturum'};
    return {durum: 'misafir'};
  }

  async function authedFetch(url, init = {}){
    const opts = {...init, headers:{...(init.headers || {})}};
    if (access) opts.headers.Authorization = `Bearer ${access}`;
    let res = await nativeFetch(url, opts);
    if (res.status !== 401) return res;
    // Kendiliğinden yönlendirme yok: oturum düşerse çağıran tarafa hata döner.
    if (!(await yenile())){ access = refresh = null; throw new Error("Pusula oturumunuz sona erdi; kullanıcı menüsünden yeniden bağlanın."); }
    opts.headers.Authorization = `Bearer ${access}`;
    res = await nativeFetch(url, opts);
    if (res.status === 401){ access = refresh = null; throw new Error("Pusula oturumu doğrulanamadı; kullanıcı menüsünden yeniden bağlanın."); }
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
