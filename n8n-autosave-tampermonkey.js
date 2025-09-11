// ==UserScript==
// @namespace    https://your-website.com/
// @version      1.2.0
// @match        https://your-website.com/*
// @match        http://your-website.com/*
// @match        https://*.your-website.com/*
// @match        http://*.cyour-website.com/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const INTERVAL_SEC = 180; // 3 min

  let deadline      = 0;
  let tickId        = null;
  let lastBtn       = null;
  let originalText  = null;

  const style = document.createElement('style');
  style.textContent = `
    .__n8n_autosave_btn {
      position: relative !important;
      min-width: 110px !important;
    }
  `;
  document.documentElement.appendChild(style);

  const selectors = [
    '[data-test-id="workflow-save-button"] button:not([disabled])',
    '[data-test-id="workflow-save-button"] button',
    'button[aria-label="Save"]:not([disabled])',
    'button[aria-label="Save"]',
    'button:enabled',
    'button'
  ];

  function findSaveButton() {
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn) {
        const txt = (btn.textContent || '').trim();
        if (/save/i.test(txt)) return btn;
        if (sel.includes('workflow-save-button')) return btn;
      }
    }
    const span = Array.from(document.querySelectorAll('span'))
      .find(s => /save/i.test((s.textContent || '').trim()));
    return span ? span.closest('button') : null;
  }

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function ensureOriginalText(btn) {
    if (!btn) return;
    const span = btn.querySelector('span');
    const current = span ? span.textContent : btn.textContent;
    if (!originalText || (lastBtn && btn !== lastBtn)) {
      const base = (current || 'Save').replace(/\s*\(\d{2}:\d{2}\)\s*$/,'').trim();
      originalText = base || 'Save';
    }
  }

  function setLabel(btn, secondsLeft) {
    if (!btn) return;
    ensureOriginalText(btn);
    const label = `${originalText} (${fmt(secondsLeft)})`;
    const span = btn.querySelector('span');
    if (span) span.textContent = label;
    else btn.textContent = label;
    btn.classList.add('__n8n_autosave_btn');
  }

  let lastClickTs = 0;
  function clickSave() {
    const btn = findSaveButton();
    if (!btn || btn.disabled) return false;
    const now = Date.now();
    if (now - lastClickTs < 1000) return false;
    lastClickTs = now;
    btn.click();
    return true;
  }

  function schedule() {
    if (tickId) clearInterval(tickId);
    const btn = findSaveButton();
    if (!btn) {
      // ждём загрузки UI
      tickId = setInterval(loop, 500);
      return;
    }
    lastBtn = btn;
    originalText = null;

    clickSave(); // стартовый сейв
    deadline = Date.now() + INTERVAL_SEC * 1000;

    tickId = setInterval(loop, 1000);
    loop();
  }

  function loop() {
    const btn = findSaveButton();
    if (btn && btn !== lastBtn) {
      lastBtn = btn;
      originalText = null;
    }
    if (!lastBtn) return;

    const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    setLabel(lastBtn, left);

    if (left <= 0) {
      if (clickSave()) {
        deadline = Date.now() + INTERVAL_SEC * 1000;
        setLabel(lastBtn, INTERVAL_SEC);
      } else {
        deadline = Date.now() + 5000;
      }
    }
  }

  new MutationObserver(() => {
    const btn = findSaveButton();
    if (btn && btn !== lastBtn) {
      lastBtn = btn;
      originalText = null;
      setLabel(lastBtn, Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('visibilitychange', () => {
  });

  schedule();
})();
