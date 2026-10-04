/* ============================================================
 *  tarus Tasarla — ekosistem teması
 *  Çerez mantığı ozluk/tarus-kabuk/utils/themeCookie.ts'nin düz JS karşılığıdır
 *  (Tasarla derleme adımı olmayan statik bir uygulama, TS dosyası doğrudan
 *  kullanılamıyor). Tema listesi TemaSecici.tsx'teki TEMALAR ile aynıdır.
 *  Sınıf <html>'e verilir: class="theme-<id>".
 * ============================================================ */
(function (kok) {
  const KEY = 'tarus-theme';
  const ONE_YEAR = 60 * 60 * 24 * 365;
  const VARSAYILAN = 'modern'; // çerez yokken (ekosistem kararı 2026-10-04)

  const TEMALAR = [
    {id: 'modern',   ad: 'Modern Işık', aciklama: 'Açık slate zemin + beyaz kart.',        ikon: 'sun'},
    {id: 'sage',     ad: 'Adaçayı',     aciklama: 'Sakin adaçayı yeşili açık yüzeyler.',   ikon: 'leaf'},
    {id: 'karanlik', ad: 'Karanlık',    aciklama: 'Nötr siyah zemin + mavi vurgu.',        ikon: 'moon'},
    {id: 'ocean',    ad: 'Okyanus',     aciklama: 'Derin okyanus laciverti + gök mavisi.', ikon: 'waves'},
    {id: 'sand',     ad: 'Kahve',       aciklama: 'Sıcak kağıt beji + terracotta.',        ikon: 'coffee'},
    {id: 'sunset',   ad: 'Günbatımı',   aciklama: 'Kömür kızılı + alev turuncusu.',        ikon: 'flame'},
    {id: 'forest',   ad: 'Orman',       aciklama: 'Derin orman yeşili + zümrüt vurgu.',    ikon: 'trees'},
    {id: 'violet',   ad: 'Menekşe',     aciklama: 'Gece moru + fuşya ışıltısı.',           ikon: 'flower'},
  ];
  const gecerli = id => TEMALAR.some(t => t.id === id);

  const cookieDomain = () => {
    const host = location.hostname;
    return host === 'tarus.tr' || host.endsWith('.tarus.tr') ? '.tarus.tr' : null;
  };
  const readCookie = () => {
    const match = document.cookie.split('; ').find(part => part.startsWith(`${KEY}=`));
    return match ? decodeURIComponent(match.slice(KEY.length + 1)) : null;
  };
  function writeCookie(theme){
    const domain = cookieDomain();
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${KEY}=${encodeURIComponent(theme)}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${domain ? `; Domain=${domain}` : ''}${secure}`;
  }
  // Kayıtlı tema: önce ortak çerez, sonra bu uygulamanın localStorage'ı (çereze taşınır)
  function readStoredTheme(){
    try {
      const shared = readCookie();
      if (shared) return shared;
      const local = localStorage.getItem(KEY);
      if (local) writeCookie(local);
      return local;
    } catch (e) { return null; }
  }
  function writeStoredTheme(theme){
    try { localStorage.setItem(KEY, theme); } catch (e) { /* depolama kapalı */ }
    writeCookie(theme);
  }
  function subscribeStoredTheme(onChange){
    let last = readStoredTheme();
    const check = () => { const cur = readStoredTheme(); if (cur && cur !== last){ last = cur; onChange(cur); } };
    addEventListener('storage', e => { if (e.key === KEY && e.newValue){ last = e.newValue; onChange(e.newValue); } });
    addEventListener('focus', check);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }

  let aktif = null;
  const dinleyiciler = [];
  function uygula(id){
    if (!gecerli(id)) id = VARSAYILAN;
    const el = document.documentElement;
    TEMALAR.forEach(t => el.classList.remove('theme-' + t.id));
    el.classList.add('theme-' + id);
    aktif = id;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(el).getPropertyValue('--bg').trim() || '#f1f5f9';
    dinleyiciler.forEach(fn => fn(id));
  }
  function sec(id){ writeStoredTheme(id); uygula(id); }

  uygula(readStoredTheme());
  subscribeStoredTheme(uygula);

  kok.TarusTema = {TEMALAR, sec, aktif: () => aktif, acikMi: () => ['modern', 'sage', 'sand'].includes(aktif),
    degisince: fn => dinleyiciler.push(fn)};
})(window);
