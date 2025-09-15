// ==UserScript==
// @name         n8n autosave inline timer
// @match        https://your-n8n-domain.com/*
// @match        http://your-n8n-domain.com/*
// @match        https://*.your-n8n-domain.com/*
// @match        http://*.your-n8n-domain.com/*
// @run-at       document-idle
// @noframes

// ==/UserScript==

(() => {
  'use strict';
  
  const CONFIG = {
    INTERVAL_SEC: 180,
    RETRY_DELAY: 5000,
    SEARCH_INTERVAL: 500,
    UPDATE_INTERVAL: 1000,
    MIN_BUTTON_WIDTH: '110px',
    MAX_SHADOW_DEPTH: 5,        // NEW: ограничим глубину обхода
  };

  const state = {
    deadline: 0,
    tickId: null,
    searchId: null,
    currentButton: null,
    originalText: null,
    isActive: false,
    isPaused: false,
    pauseRemainingSec: null,     // NEW: секунды, оставшиеся на момент паузы
    lastUrl: '',
  };

  const isNodeEditorOpen = () => {
    const currentUrl = window.location.href;
    const workflowMatch = currentUrl.match(/\/workflow\/[^\/]+\/([^\/\?#]+)/);
    return workflowMatch && workflowMatch[1] && workflowMatch[1].length > 0;
  };

  // NEW: глубокий querySelector с заходом в shadow DOM
  const deepQuerySelector = (root, selector, depth = 0) => {
    if (!root || depth > CONFIG.MAX_SHADOW_DEPTH) return null;
    const direct = root.querySelector?.(selector);
    if (direct) return direct;
    const all = root.querySelectorAll?.('*') || [];
    for (const el of all) {
      const sr = el.shadowRoot;
      if (sr) {
        const found = deepQuerySelector(sr, selector, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };

  const isVisible = (el) => {
    if (!el) return false;
    const style = el.ownerDocument?.defaultView?.getComputedStyle(el);
    if (!style) return false;
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  // NEW: ищем модалку node-creator и учитываем shadow DOM
  const isNodeCreatorOpen = () => {
    const modal =
      document.querySelector('[data-test-id="node-creator"]') ||
      deepQuerySelector(document.documentElement, '[data-test-id="node-creator"]');
    return !!modal && isVisible(modal);
  };

  const shouldPauseAutosave = () => {
    return isNodeEditorOpen() || isNodeCreatorOpen(); // CHANGED
  };

  // NEW: вход/выход из паузы — сохраняем/восстанавливаем дедлайн
  const updatePauseState = () => {
    const wantPause = shouldPauseAutosave();
    if (wantPause === state.isPaused) return;

    if (wantPause) {
      // входим в паузу: запоминаем остаток и "замораживаем" показ
      const remaining = Math.max(0, Math.round((state.deadline - Date.now()) / 1000));
      state.pauseRemainingSec = remaining;
      state.isPaused = true;
      console.log('[n8n-autosave] Paused (editor/creator open). Remaining:', remaining, 'sec');
      if (state.currentButton) updateButtonText(state.currentButton, state.pauseRemainingSec, true);
    } else {
      // выходим из паузы: переносим дедлайн на будущее на величину остатка
      const remain = Number.isFinite(state.pauseRemainingSec) ? state.pauseRemainingSec : CONFIG.INTERVAL_SEC;
      state.deadline = Date.now() + remain * 1000;
      state.pauseRemainingSec = null;
      state.isPaused = false;
      console.log('[n8n-autosave] Resumed (editor/creator closed). New deadline in', remain, 'sec');
      if (state.currentButton) updateButtonText(state.currentButton, remain, false);
    }
  };

const initStyles = () => {
  if (document.querySelector('#n8n-autosave-styles')) return;
  const style = document.createElement('style');
  style.id = 'n8n-autosave-styles';
  style.textContent = `
    .n8n-autosave-btn {
      position: relative !important;
      min-width: ${CONFIG.MIN_BUTTON_WIDTH} !important;
      transition: opacity 0.3s ease, color 0.2s ease !important;
    }
    .n8n-autosave-btn.saving {
      opacity: 0.7 !important;
    }
    .n8n-autosave-btn.paused {
      opacity: 0.5 !important;
    }
    .n8n-autosave-btn.paused:hover {
      opacity: 1 !important; /* <— при наведении кнопка полностью видима */
    }
  `;
  document.head.appendChild(style);
};


  const findSaveButton = () => document.querySelector('[data-test-id="workflow-save-button"] button');

  const formatTime = (seconds) => {
    const sec = Math.max(0, Math.floor(seconds));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const saveOriginalText = (btn) => {
    if (!btn || (state.currentButton === btn && state.originalText)) return;
    const span = btn.querySelector('span');
    const currentText = span ? span.textContent : btn.textContent;
    state.originalText = (currentText || 'Save')
      .replace(/\s*\(\d{2}:\d{2}\)\s*$/, '')
      .replace(/\s*\(\d{2}:\d{2}\s*⏸\)\s*$/, '')
      .trim() || 'Save';
  };

  const updateButtonText = (btn, secondsLeft, paused = false) => {
    if (!btn) return;
    saveOriginalText(btn);
    const label = paused
      ? `${state.originalText} (${formatTime(secondsLeft)} ⏸)`
      : `${state.originalText} (${formatTime(secondsLeft)})`;
    const span = btn.querySelector('span');
    if (span) span.textContent = label; else btn.textContent = label;
    btn.classList.add('n8n-autosave-btn');
    btn.classList.toggle('paused', !!paused);
  };

  const restoreButtonText = (btn) => {
    if (!btn || !state.originalText) return;
    const span = btn.querySelector('span');
    if (span) span.textContent = state.originalText; else btn.textContent = state.originalText;
    btn.classList.remove('n8n-autosave-btn', 'saving', 'paused');
  };

  const performSave = async () => {
    const btn = findSaveButton();
    if (!btn || btn.disabled) return false;
    try {
      btn.classList.add('saving');
      btn.click();
      await new Promise(r => setTimeout(r, 100));
      return true;
    } catch (e) {
      console.error('[n8n-autosave] Save error:', e);
      return false;
    } finally {
      if (btn) btn.classList.remove('saving');
    }
  };

  const scheduleNext = () => {
    state.deadline = Date.now() + CONFIG.INTERVAL_SEC * 1000;
  };

  const stopTimers = () => {
    if (state.tickId) { clearInterval(state.tickId); state.tickId = null; }
    if (state.searchId) { clearInterval(state.searchId); state.searchId = null; }
  };

  // MAIN LOOP
  const updateLoop = () => {
    const btn = findSaveButton();

    const currentUrl = window.location.href;
    if (currentUrl !== state.lastUrl) state.lastUrl = currentUrl;

    // всегда сверяемся (и с модалкой, и с URL)
    updatePauseState();

    if (btn !== state.currentButton) {
      if (state.currentButton) restoreButtonText(state.currentButton);
      state.currentButton = btn;
      state.originalText = null;
    }

    if (!state.currentButton) {
      startSearchMode();
      return;
    }

    // CHANGED: во время паузы не декрементим — показываем замороженное значение
    const timeLeft = state.isPaused
      ? (Number.isFinite(state.pauseRemainingSec) ? state.pauseRemainingSec : CONFIG.INTERVAL_SEC)
      : Math.max(0, Math.round((state.deadline - Date.now()) / 1000));

    updateButtonText(state.currentButton, timeLeft, state.isPaused);

    // CHANGED: не сохраняем в паузе вообще
    if (!state.isPaused && timeLeft <= 0) {
      performSave().then(success => {
        if (success) {
          scheduleNext();
          updateButtonText(state.currentButton, CONFIG.INTERVAL_SEC, false);
        } else {
          state.deadline = Date.now() + CONFIG.RETRY_DELAY;
        }
      });
    }
  };

  const startSearchMode = () => {
    if (!state.isActive) return;
    stopTimers();
    state.searchId = setInterval(() => {
      const btn = findSaveButton();
      if (btn) {
        state.currentButton = btn;
        state.originalText = null;
        startMainMode();
      }
    }, CONFIG.SEARCH_INTERVAL);
  };

  const startMainMode = () => {
    if (!state.isActive) return;
    stopTimers();
    // если мы уже в паузе (модалка открыта при старте), посчитаем остаток как полный интервал
    if (shouldPauseAutosave()) {
      state.isPaused = true;
      state.pauseRemainingSec = CONFIG.INTERVAL_SEC;
    } else {
      scheduleNext();
    }
    state.tickId = setInterval(updateLoop, CONFIG.UPDATE_INTERVAL);
    updateLoop();
  };

  const setupUrlChangeHandler = () => {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function(...args) { originalPushState.apply(this, args); setTimeout(updatePauseState, 100); };
    history.replaceState = function(...args) { originalReplaceState.apply(this, args); setTimeout(updatePauseState, 100); };
    window.addEventListener('popstate', () => setTimeout(updatePauseState, 100));
  };

  const init = () => {
    state.isActive = true;
    state.lastUrl = window.location.href;
    initStyles();
    setupUrlChangeHandler();

    const observer = new MutationObserver(() => {
      if (!state.isActive) return;
      updatePauseState(); // важно: ловим появление/исчезновение модалки
      const btn = findSaveButton();
      if (btn && btn !== state.currentButton) {
        state.currentButton = btn;
        state.originalText = null;
        const shown = state.isPaused
          ? (Number.isFinite(state.pauseRemainingSec) ? state.pauseRemainingSec : CONFIG.INTERVAL_SEC)
          : Math.max(0, Math.round((state.deadline - Date.now()) / 1000));
        updateButtonText(state.currentButton, shown, state.isPaused);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'class', 'style', 'aria-hidden']
    });

    const btn = findSaveButton();
    if (btn) {
      state.currentButton = btn;
      startMainMode();
    } else {
      startSearchMode();
    }

    window.addEventListener('beforeunload', () => {
      state.isActive = false;
      stopTimers();
      if (state.currentButton) restoreButtonText(state.currentButton);
      observer.disconnect();
    });

    console.log('[n8n-autosave] Initialized. Interval:', CONFIG.INTERVAL_SEC, 'sec');
    console.log('[n8n-autosave] Pause on node editor/creator: enabled');
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
