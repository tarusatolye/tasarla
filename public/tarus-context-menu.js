/**
 * Tarus Ekosistemi — Genel Sağ Tık Menüsü ve YouTube-Stili 1-2 Döngüsü
 *
 * Standart (§19g):
 * 1. Sağ tık: Tarus özel pop-up menüsü açılır ("Hata bildir" [kırmızı] + "Sayfayı yenile" [mavi]).
 * 2. Sağ tık: Tarus menüsü kapanır, tarayıcının yerel bağlam menüsü (İncele / Inspect vb.) açılır.
 * 3. Sağ tık: Yeniden Tarus özel menüsü açılır (döngüsel devam eder).
 *
 * İstisnalar:
 * - Metin seçiliyken veya input, textarea, contenteditable alanlarında tarayıcının yerel menüsü korunur.
 */
(function () {
  'use strict';

  if (window.__tarusContextMenuInstalled) return;
  window.__tarusContextMenuInstalled = true;

  var isMenuOpen = false;
  var activeMenuEl = null;
  var activeModalEl = null;

  // ── CSS Stilleri (Tek seferlik head'e enjekte edilir) ──
  function injectStyles() {
    if (document.getElementById('tarus-cm-styles')) return;
    var style = document.createElement('style');
    style.id = 'tarus-cm-styles';
    style.textContent = [
      '@keyframes tarusCmFadeIn {',
      '  from { opacity: 0; transform: scale(0.96); }',
      '  to { opacity: 1; transform: scale(1); }',
      '}',
      '.tarus-cm-popup {',
      '  position: fixed; z-index: 999999;',
      '  background: var(--modal-bg, var(--card, #18181b));',
      '  color: var(--text-primary, var(--text, #f4f4f5));',
      '  border: 1px solid var(--bdr-1, rgba(255, 255, 255, 0.12));',
      '  border-radius: 14px;',
      '  box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06);',
      '  padding: 6px;',
      '  min-width: 175px;',
      '  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  user-select: none; -webkit-user-select: none;',
      '  animation: tarusCmFadeIn 0.12s cubic-bezier(0.16, 1, 0.3, 1) forwards;',
      '  transform-origin: top left;',
      '}',
      'html.theme-modern .tarus-cm-popup, html.theme-sand .tarus-cm-popup, html.theme-sage .tarus-cm-popup,',
      'html[data-theme="modern"] .tarus-cm-popup, html[data-theme="sand"] .tarus-cm-popup, html[data-theme="sage"] .tarus-cm-popup {',
      '  background: #ffffff; color: #18181b;',
      '  border: 1px solid rgba(0, 0, 0, 0.1);',
      '  box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);',
      '}',
      '.tarus-cm-item {',
      '  display: flex; align-items: center; gap: 10px; width: 100%;',
      '  padding: 8px 12px; border-radius: 8px; border: none; background: transparent;',
      '  font-size: 13px; font-weight: 600; text-align: left; cursor: pointer;',
      '  font-family: inherit;',
      '  transition: background 0.15s, color 0.15s;',
      '}',
      '.tarus-cm-item-danger {',
      '  color: #ef4444;',
      '}',
      '.tarus-cm-item-danger:hover {',
      '  background: rgba(239, 68, 68, 0.12); color: #f87171;',
      '}',
      // Uygulamaların açık tema düğme kuralı (ör. Posta: tüm button'lara
      // color: var(--text) !important) "Hata bildir"i siyaha çekiyordu;
      // renk kimlik seçicisiyle sabitlenir (2026-09-29).
      '.tarus-cm-popup #tarus-cm-bug, .tarus-cm-popup #tarus-cm-bug span { color: #ef4444 !important; }',
      '.tarus-cm-popup #tarus-cm-bug:hover, .tarus-cm-popup #tarus-cm-bug:hover span { color: #f87171 !important; }',
      '.tarus-cm-item-default {',
      '  color: var(--text-primary, var(--text, #f4f4f5));',
      '}',
      'html.theme-modern .tarus-cm-item-default, html.theme-sand .tarus-cm-item-default, html.theme-sage .tarus-cm-item-default,',
      'html[data-theme="modern"] .tarus-cm-item-default, html[data-theme="sand"] .tarus-cm-item-default, html[data-theme="sage"] .tarus-cm-item-default {',
      '  color: #18181b;',
      '}',
      '.tarus-cm-item-default:hover {',
      '  background: rgba(255, 255, 255, 0.08);',
      '}',
      'html.theme-modern .tarus-cm-item-default:hover, html.theme-sand .tarus-cm-item-default:hover, html.theme-sage .tarus-cm-item-default:hover,',
      'html[data-theme="modern"] .tarus-cm-item-default:hover, html[data-theme="sand"] .tarus-cm-item-default:hover, html[data-theme="sage"] .tarus-cm-item-default:hover {',
      '  background: rgba(0, 0, 0, 0.06);',
      '}',
      '.tarus-cm-divider {',
      '  height: 1px; margin: 4px 6px;',
      '  background: var(--bdr-1, rgba(255, 255, 255, 0.08));',
      '}',
      'html.theme-modern .tarus-cm-divider, html.theme-sand .tarus-cm-divider, html.theme-sage .tarus-cm-divider,',
      'html[data-theme="modern"] .tarus-cm-divider, html[data-theme="sand"] .tarus-cm-divider, html[data-theme="sage"] .tarus-cm-divider {',
      '  background: rgba(0, 0, 0, 0.08);',
      '}',
      '/* ── Hata Bildir Modalı ── */',
      '@keyframes tarusFbIn {',
      '  from { opacity: 0; transform: scale(0.96) translateY(4px); }',
      '  to { opacity: 1; transform: scale(1) translateY(0); }',
      '}',
      '.tarus-fb-overlay {',
      '  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65);',
      '  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);',
      '  z-index: 1000000; display: flex; align-items: center; justify-content: center; padding: 16px;',
      '  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '}',
      '.tarus-fb-dialog {',
      '  width: 100%; max-width: 480px;',
      '  background: var(--modal-bg, var(--card, #18181b));',
      '  border: 1px solid var(--bdr-1, rgba(255, 255, 255, 0.12));',
      '  border-radius: 14px; box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.6);',
      '  overflow: hidden; color: var(--text-primary, var(--text, #f4f4f5));',
      '  animation: tarusFbIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;',
      '}',
      'html.theme-modern .tarus-fb-dialog, html.theme-sand .tarus-fb-dialog, html.theme-sage .tarus-fb-dialog,',
      'html[data-theme="modern"] .tarus-fb-dialog, html[data-theme="sand"] .tarus-fb-dialog, html[data-theme="sage"] .tarus-fb-dialog {',
      '  background: #ffffff; color: #18181b;',
      '  border: 1px solid rgba(0, 0, 0, 0.1);',
      '  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.2);',
      '}',
      '.tarus-fb-header {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 16px 20px; border-bottom: 1px solid var(--bdr-1, rgba(255, 255, 255, 0.08));',
      '}',
      'html.theme-modern .tarus-fb-header, html.theme-sand .tarus-fb-header, html.theme-sage .tarus-fb-header {',
      '  border-bottom: 1px solid rgba(0, 0, 0, 0.08);',
      '}',
      '.tarus-fb-title-wrap { display: flex; align-items: center; gap: 10px; }',
      '.tarus-fb-title { font-size: 15px; font-weight: 800; }',
      '.tarus-fb-subtitle { font-size: 11px; opacity: 0.65; margin-top: 2px; }',
      '.tarus-fb-close {',
      '  background: transparent; border: none; color: inherit; opacity: 0.6; font-size: 20px;',
      '  cursor: pointer; padding: 4px; border-radius: 6px; line-height: 1; transition: opacity 0.15s;',
      '}',
      '.tarus-fb-close:hover { opacity: 1; }',
      '.tarus-fb-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }',
      '.tarus-fb-tabs { display: flex; gap: 4px; background: rgba(125, 125, 125, 0.12); padding: 3px; border-radius: 8px; }',
      '.tarus-fb-tab {',
      '  flex: 1; padding: 6px 12px; border: none; border-radius: 6px; background: transparent;',
      '  font-size: 12px; font-weight: 700; color: inherit; opacity: 0.65; cursor: pointer; transition: all 0.15s;',
      '}',
      '.tarus-fb-tab.is-active { opacity: 1; background: var(--card, rgba(255, 255, 255, 0.15)); }',
      'html.theme-modern .tarus-fb-tab.is-active, html.theme-sand .tarus-fb-tab.is-active, html.theme-sage .tarus-fb-tab.is-active {',
      '  background: #ffffff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);',
      '}',
      '.tarus-fb-field { display: flex; flex-direction: column; gap: 6px; }',
      '.tarus-fb-label { font-size: 11px; font-weight: 700; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; }',
      '.tarus-fb-input, .tarus-fb-textarea {',
      '  width: 100%; border: 1px solid var(--bdr-2, rgba(255, 255, 255, 0.15)); border-radius: 8px;',
      '  padding: 8px 12px; font-size: 13px; font-family: inherit; background: rgba(125, 125, 125, 0.08);',
      '  color: inherit; outline: none; transition: border-color 0.15s;',
      '}',
      '.tarus-fb-input:focus, .tarus-fb-textarea:focus { border-color: #3b82f6; }',
      '.tarus-fb-textarea { resize: none; }',
      '.tarus-fb-msg { padding: 8px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; text-align: center; }',
      '.tarus-fb-msg.is-success { background: rgba(34, 197, 94, 0.15); color: #22c55e; }',
      '.tarus-fb-msg.is-error { background: rgba(239, 68, 68, 0.15); color: #ef4444; }',
      '.tarus-fb-footer {',
      '  display: flex; align-items: center; justify-content: flex-end; gap: 8px;',
      '  padding: 12px 20px; border-top: 1px solid var(--bdr-1, rgba(255, 255, 255, 0.08));',
      '}',
      'html.theme-modern .tarus-fb-footer, html.theme-sand .tarus-fb-footer, html.theme-sage .tarus-fb-footer {',
      '  border-top: 1px solid rgba(0, 0, 0, 0.08);',
      '}',
      '.tarus-fb-btn-cancel, .tarus-fb-btn-submit {',
      '  padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 700;',
      '  cursor: pointer; transition: all 0.15s;',
      '}',
      '.tarus-fb-btn-cancel {',
      '  background: transparent; border: 1px solid var(--bdr-2, rgba(255, 255, 255, 0.15)); color: inherit; opacity: 0.8;',
      '}',
      '.tarus-fb-btn-cancel:hover { opacity: 1; background: rgba(125, 125, 125, 0.1); }',
      '.tarus-fb-btn-submit {',
      '  background: #2563eb; border: none; color: #ffffff;',
      '}',
      '.tarus-fb-btn-submit:hover { background: #1d4ed8; }',
      '.tarus-fb-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Menüyü Kapatma ──
  function closeMenu() {
    if (activeMenuEl) {
      if (activeMenuEl.parentNode) activeMenuEl.parentNode.removeChild(activeMenuEl);
      activeMenuEl = null;
    }
    isMenuOpen = false;
  }

  // ── Menüyü Açma ──
  function openMenu(x, y) {
    closeMenu();
    injectStyles();

    var el = document.createElement('div');
    el.className = 'tarus-cm-popup';
    el.innerHTML = [
      '<button type="button" class="tarus-cm-item tarus-cm-item-danger" id="tarus-cm-bug">',
      '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '    <path d="m8 2 1.88 1.88"/>',
      '    <path d="M14.12 3.88 16 2"/>',
      '    <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/>',
      '    <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/>',
      '    <path d="M12 20v-9"/>',
      '    <path d="M6.53 9C4.6 8.8 3 7.1 3 5"/>',
      '    <path d="M6 13H2"/>',
      '    <path d="M3 21c0-2.1 1.7-3.9 3.8-4"/>',
      '    <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/>',
      '    <path d="M22 13h-4"/>',
      '    <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
      '  </svg>',
      '  <span>Hata bildir</span>',
      '</button>',
      '<div class="tarus-cm-divider"></div>',
      '<button type="button" class="tarus-cm-item tarus-cm-item-default" id="tarus-cm-reload">',
      '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>',
      '    <path d="M21 3v5h-5"/>',
      '    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>',
      '    <path d="M8 16H3v5"/>',
      '  </svg>',
      '  <span>Sayfayı yenile</span>',
      '</button>'
    ].join('');

    el.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    document.body.appendChild(el);
    activeMenuEl = el;
    isMenuOpen = true;

    // Viewport sınırlandırması
    var pad = 8;
    var rect = el.getBoundingClientRect();
    var posX = Math.max(pad, Math.min(x, window.innerWidth - rect.width - pad));
    var posY = Math.max(pad, Math.min(y, window.innerHeight - rect.height - pad));
    el.style.left = posX + 'px';
    el.style.top = posY + 'px';

    // Aksiyonlar
    var reloadBtn = el.querySelector('#tarus-cm-reload');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', function () {
        closeMenu();
        window.location.reload();
      });
    }

    var bugBtn = el.querySelector('#tarus-cm-bug');
    if (bugBtn) {
      bugBtn.addEventListener('click', function () {
        closeMenu();
        if (typeof window.__tarusOpenHataBildir === 'function') {
          window.__tarusOpenHataBildir();
        } else {
          openFeedbackModal();
        }
      });
    }
  }

  // ── Hata Bildir Modalı ──
  function openFeedbackModal() {
    if (activeModalEl && activeModalEl.parentNode) {
      activeModalEl.parentNode.removeChild(activeModalEl);
    }
    injectStyles();

    var moduleName = document.title || window.location.pathname;
    var selectedType = 'bug';

    var overlay = document.createElement('div');
    overlay.className = 'tarus-fb-overlay';
    overlay.innerHTML = [
      '<div class="tarus-fb-dialog" role="dialog" aria-modal="true">',
      '  <div class="tarus-fb-header">',
      '    <div class="tarus-fb-title-wrap">',
      '      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '        <path d="m8 2 1.88 1.88"/>',
      '        <path d="M14.12 3.88 16 2"/>',
      '        <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/>',
      '        <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/>',
      '        <path d="M12 20v-9"/>',
      '        <path d="M6.53 9C4.6 8.8 3 7.1 3 5"/>',
      '        <path d="M6 13H2"/>',
      '        <path d="M3 21c0-2.1 1.7-3.9 3.8-4"/>',
      '        <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/>',
      '        <path d="M22 13h-4"/>',
      '        <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
      '      </svg>',
      '      <div>',
      '        <div class="tarus-fb-title">Hata bildir</div>',
      '        <div class="tarus-fb-subtitle">' + escapeHtml(moduleName) + '</div>',
      '      </div>',
      '    </div>',
      '    <button type="button" class="tarus-fb-close" aria-label="Kapat">&times;</button>',
      '  </div>',
      '  <div class="tarus-fb-body">',
      '    <div class="tarus-fb-tabs">',
      '      <button type="button" class="tarus-fb-tab is-active" data-type="bug">Hata</button>',
      '      <button type="button" class="tarus-fb-tab" data-type="idea">Fikir</button>',
      '    </div>',
      '    <div class="tarus-fb-field">',
      '      <label class="tarus-fb-label">Başlık</label>',
      '      <input type="text" class="tarus-fb-input" id="tarus-fb-title" placeholder="Kısaca ne oldu?" autofocus />',
      '    </div>',
      '    <div class="tarus-fb-field">',
      '      <label class="tarus-fb-label">Açıklama</label>',
      '      <textarea class="tarus-fb-textarea" id="tarus-fb-desc" rows="4" placeholder="Hangi adımlardan sonra oldu? Ne bekliyordunuz?"></textarea>',
      '    </div>',
      '    <div id="tarus-fb-msg" class="tarus-fb-msg" style="display:none;"></div>',
      '  </div>',
      '  <div class="tarus-fb-footer">',
      '    <button type="button" class="tarus-fb-btn-cancel">Vazgeç</button>',
      '    <button type="button" class="tarus-fb-btn-submit">Gönder</button>',
      '  </div>',
      '</div>'
    ].join('');

    function closeModal() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      activeModalEl = null;
    }

    overlay.querySelector('.tarus-fb-close').addEventListener('click', closeModal);
    overlay.querySelector('.tarus-fb-btn-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    var tabs = overlay.querySelectorAll('.tarus-fb-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('is-active'); });
        tab.classList.add('is-active');
        selectedType = tab.getAttribute('data-type') || 'bug';
      });
    });

    var submitBtn = overlay.querySelector('.tarus-fb-btn-submit');
    var titleInput = overlay.querySelector('#tarus-fb-title');
    var descInput = overlay.querySelector('#tarus-fb-desc');
    var msgDiv = overlay.querySelector('#tarus-fb-msg');

    submitBtn.addEventListener('click', function () {
      var title = (titleInput.value || '').trim();
      var desc = (descInput.value || '').trim();
      if (!title || !desc) {
        msgDiv.className = 'tarus-fb-msg is-error';
        msgDiv.textContent = 'Başlık ve açıklama alanları zorunludur.';
        msgDiv.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Gönderiliyor…';

      var payload = {
        type: selectedType,
        title: title,
        module: moduleName,
        description: desc,
        meta: {
          path: window.location.pathname + window.location.search,
          viewport: window.innerWidth + 'x' + window.innerHeight,
          userAgent: navigator.userAgent
        }
      };

      // Bildirimler Pusula'ya kaydedilir; Pusula onları sistem.tarus.tr'deki
      // Hata panosuna uygulama adıyla düşürür. Eskiden 19 Eylül'de kapatılan
      // portal.tarus.tr'ye gidiyordu ve hata olsa bile "kaydedildi" deniyordu —
      // bildirimler sessizce kayboluyordu (2026-09-25).
      payload.meta.app = window.location.hostname;
      var headers = { 'Content-Type': 'application/json' };
      try {
        // Posta Pusula'ya çerezle değil Bearer ile bağlı; diğerleri Pusula çerezini taşır.
        var postaToken = window.localStorage && window.localStorage.getItem('posta_access_token');
        if (postaToken) headers.Authorization = 'Bearer ' + postaToken;
      } catch (err) { /* depolama kapalı */ }

      var showError = function (text) {
        msgDiv.className = 'tarus-fb-msg is-error';
        msgDiv.textContent = text;
        msgDiv.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Gönder';
      };

      fetch('https://pusula.tarus.tr/auth/feedbacks/', {
        method: 'POST',
        headers: headers,
        credentials: 'include',
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          if (res.status === 401 || res.status === 403) {
            showError('Bildirim gönderilemedi: Pusula oturumunuz yok. pusula.tarus.tr\'ye giriş yapıp tekrar deneyin.');
            return;
          }
          if (!res.ok) {
            showError('Bildirim gönderilemedi (' + res.status + '). Lütfen tekrar deneyin.');
            return;
          }
          msgDiv.className = 'tarus-fb-msg is-success';
          msgDiv.textContent = 'Bildiriminiz iletildi. Teşekkürler.';
          msgDiv.style.display = 'block';
          setTimeout(closeModal, 1200);
        })
        .catch(function () {
          showError('Bildirim gönderilemedi: bağlantı kurulamadı. Lütfen tekrar deneyin.');
        });
    });

    document.body.appendChild(overlay);
    activeModalEl = overlay;
  }

  // ── YouTube-Stili 1-2 Sağ Tık Döngüsü ──
  document.addEventListener('contextmenu', function (e) {
    if (activeModalEl) return;

    // 1. Form girdi elemanları veya metin seçimi varsa yerel tarayıcı menüsünü serbest bırak
    var target = e.target;
    if (target && target.closest && target.closest('input, textarea, [contenteditable="true"]')) {
      if (isMenuOpen) closeMenu();
      return;
    }
    var sel = window.getSelection ? window.getSelection().toString() : '';
    if (sel && sel.trim().length > 0) {
      if (isMenuOpen) closeMenu();
      return;
    }

    // 2. YouTube-stili 2. sağ tık: Menü zaten açıksa, kapat ve tarayıcının yerel menüsünü AÇ!
    if (isMenuOpen) {
      closeMenu();
      // e.preventDefault() ÇAĞRILMAZ! Yerel tarayıcı menüsü doğrudan imleçte açılır.
      return;
    }

    // 3. 1. sağ tık: Menü kapalıydı. Tarus özel menüsünü aç!
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  }, true);

  // Sol tıkta dışarı tıklanırsa kapat (Sağ tık button=2 durumunda müdahale etme ki contextmenu döngüsü bozulmasın)
  function handleOutside(e) {
    if (e.button === 2) return;
    if (activeMenuEl && !activeMenuEl.contains(e.target)) {
      closeMenu();
    }
  }
  document.addEventListener('pointerdown', handleOutside, true);
  document.addEventListener('mousedown', handleOutside, true);

  // Escape tuşunda kapat
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (isMenuOpen) closeMenu();
      if (activeModalEl) {
        if (activeModalEl.parentNode) activeModalEl.parentNode.removeChild(activeModalEl);
        activeModalEl = null;
      }
    }
  });

  // Pencere boyutu değiştiğinde veya sayfa kaydırıldığında menüyü kapat
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);
})();
