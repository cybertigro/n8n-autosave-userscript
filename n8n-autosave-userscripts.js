// ==UserScript==
// @name         n8n autosave inline timer v6.1
// @namespace    http://tampermonkey.net/
// @version      6.1
// @description  Auto-save n8n workflows with visual countdown timer
// @author       You
// @match        https://your-n8n-domain.com/*
// @match        http://your-n8n-domain.com/*
// @match        https://*.your-n8n-domain.com/*
// @match        http://*.your-n8n-domain.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// @compatible   chrome Tampermonkey, Violentmonkey
// @compatible   firefox Greasemonkey, Tampermonkey, Violentmonkey  
// @compatible   safari Userscripts
// ==/UserScript==

(() => {
  'use strict';

  // === КОНФИГУРАЦИЯ ===
  const CONFIG = {
    INTERVAL_SEC: 180,
    RETRY_DELAY: 5000,
    SEARCH_INTERVAL: 500,
    UPDATE_INTERVAL: 1000,
    MIN_BUTTON_WIDTH: '110px',
    MAX_SHADOW_DEPTH: 5,
    MODAL_DEBOUNCE_MS: 400,
  };

  // === УТИЛИТЫ DOM ===
  class DOMHelper {
    static deepQuerySelector(root, selector, depth = 0) {
      if (!root || depth > CONFIG.MAX_SHADOW_DEPTH) return null;
      
      // Проверка поддержки querySelector для Safari совместимости
      if (typeof root.querySelector !== 'function') return null;
      
      const direct = root.querySelector(selector);
      if (direct) return direct;
      
      const elements = root.querySelectorAll?.('*') || [];
      for (const el of elements) {
        // Дополнительная проверка shadowRoot для Safari
        if (el.shadowRoot && typeof el.shadowRoot.querySelector === 'function') {
          const found = this.deepQuerySelector(el.shadowRoot, selector, depth + 1);
          if (found) return found;
        }
      }
      return null;
    }

    static isDisplayed(element) {
      if (!element) return false;
      
      try {
        const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
        if (!style) return false;
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      } catch (error) {
        // Fallback для Safari в случае ошибок с getComputedStyle
        console.warn('[n8n-autosave] Style computation failed:', error);
        return element.offsetWidth > 0 && element.offsetHeight > 0;
      }
    }

    static findSaveButton() {
      return document.querySelector('[data-test-id="workflow-save-button"] button');
    }
  }

  // === ДЕТЕКТОР МОДАЛЬНЫХ ОКОН ===
  class ModalDetector {
    constructor() {
      this.lastPauseSignalAt = 0;
    }

    isNodeEditorOpen() {
      const currentUrl = window.location.href;
      const match = currentUrl.match(/\/workflow\/[^\/]+\/([^\/\?#]+)/);
      return !!(match && match[1] && match[1].length > 0);
    }

    getModalElements() {
      return {
        nodeCreator: document.querySelector('[data-test-id="node-creator"]') ||
                    DOMHelper.deepQuerySelector(document.documentElement, '[data-test-id="node-creator"]'),
        overlay: document.querySelector('.el-overlay, .el-overlay-dialog, [role="dialog"][aria-modal="true"]'),
        bodyLocked: document.body.classList.contains('el-popup-parent--hidden')
      };
    }

    detectPauseSignal() {
      const { nodeCreator, overlay, bodyLocked } = this.getModalElements();
      
      const signal = this.isNodeEditorOpen() ||
                    (nodeCreator && DOMHelper.isDisplayed(nodeCreator)) ||
                    bodyLocked ||
                    (overlay && DOMHelper.isDisplayed(overlay));

      if (signal) {
        this.lastPauseSignalAt = Date.now();
      }
      return signal;
    }

    shouldPause() {
      this.detectPauseSignal();
      return (Date.now() - this.lastPauseSignalAt) < CONFIG.MODAL_DEBOUNCE_MS;
    }
  }

  // === МЕНЕДЖЕР КНОПКИ ===
  class ButtonManager {
    constructor() {
      this.currentButton = null;
      this.originalText = null;
      this.initStyles();
    }

    initStyles() {
      if (document.querySelector('#n8n-autosave-styles')) return;
      
      const style = document.createElement('style');
      style.id = 'n8n-autosave-styles';
      style.textContent = `
        .n8n-autosave-btn {
          position: relative !important;
          min-width: ${CONFIG.MIN_BUTTON_WIDTH} !important;
          transition: opacity 0.3s ease, color 0.2s ease !important;
        }
        .n8n-autosave-btn.saving { opacity: 0.7 !important; }
        .n8n-autosave-btn.paused { opacity: 0.5 !important; }
        .n8n-autosave-btn.paused:hover { opacity: 1 !important; }
      `;
      document.head.appendChild(style);
    }

    updateButton(newButton) {
      if (newButton !== this.currentButton) {
        if (this.currentButton) {
          this.restoreText();
        }
        this.currentButton = newButton;
        this.originalText = null;
      }
    }

    saveOriginalText() {
      if (!this.currentButton || this.originalText) return;
      
      const span = this.currentButton.querySelector('span');
      const currentText = span ? span.textContent : this.currentButton.textContent;
      
      this.originalText = (currentText || 'Save')
        .replace(/\s*\(\d{2}:\d{2}\)\s*$/, '')
        .replace(/\s*\(\d{2}:\d{2}\s*⏸\)\s*$/, '')
        .trim() || 'Save';
    }

    formatTime(seconds) {
      const sec = Math.max(0, Math.floor(seconds));
      const minutes = Math.floor(sec / 60);
      const secs = sec % 60;
      return `${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    }

    updateText(secondsLeft, isPaused = false) {
      if (!this.currentButton) return;
      
      this.saveOriginalText();
      const label = isPaused
        ? `${this.originalText} (${this.formatTime(secondsLeft)} ⏸)`
        : `${this.originalText} (${this.formatTime(secondsLeft)})`;
      
      const span = this.currentButton.querySelector('span');
      if (span) {
        span.textContent = label;
      } else {
        this.currentButton.textContent = label;
      }
      
      this.currentButton.classList.add('n8n-autosave-btn');
      this.currentButton.classList.toggle('paused', isPaused);
    }

    restoreText() {
      if (!this.currentButton || !this.originalText) return;
      
      const span = this.currentButton.querySelector('span');
      if (span) {
        span.textContent = this.originalText;
      } else {
        this.currentButton.textContent = this.originalText;
      }
      
      this.currentButton.classList.remove('n8n-autosave-btn', 'saving', 'paused');
    }

    async performSave() {
      if (!this.currentButton || this.currentButton.disabled) return false;
      
      try {
        this.currentButton.classList.add('saving');
        this.currentButton.click();
        await new Promise(resolve => setTimeout(resolve, 100));
        return true;
      } catch (error) {
        console.error('[n8n-autosave] Save error:', error);
        return false;
      } finally {
        this.currentButton?.classList.remove('saving');
      }
    }
  }

  // === МЕНЕДЖЕР ТАЙМЕРА ===
  class TimerManager {
    constructor() {
      this.deadline = 0;
      this.isPaused = false;
      this.pauseRemainingSec = null;
      this.tickId = null;
      this.searchId = null;
    }

    scheduleNext() {
      this.deadline = Date.now() + CONFIG.INTERVAL_SEC * 1000;
    }

    pause(remainingSeconds) {
      this.pauseRemainingSec = remainingSeconds;
      this.isPaused = true;
      console.log('[n8n-autosave] Paused. Remaining ~', remainingSeconds, 's');
    }

    resume() {
      const remainingSeconds = Number.isFinite(this.pauseRemainingSec) 
        ? this.pauseRemainingSec 
        : CONFIG.INTERVAL_SEC;
      
      this.deadline = Date.now() + remainingSeconds * 1000;
      this.pauseRemainingSec = null;
      this.isPaused = false;
      console.log('[n8n-autosave] Resumed. Next save in', remainingSeconds, 's');
      return remainingSeconds;
    }

    getTimeLeft() {
      if (this.isPaused) {
        return Number.isFinite(this.pauseRemainingSec) 
          ? this.pauseRemainingSec 
          : CONFIG.INTERVAL_SEC;
      }
      return Math.max(0, Math.round((this.deadline - Date.now()) / 1000));
    }

    isTimeUp() {
      return !this.isPaused && this.getTimeLeft() <= 0;
    }

    stopTimers() {
      if (this.tickId) {
        clearInterval(this.tickId);
        this.tickId = null;
      }
      if (this.searchId) {
        clearInterval(this.searchId);
        this.searchId = null;
      }
    }
  }

  // === ОСНОВНОЕ ПРИЛОЖЕНИЕ ===
  class AutoSaveApp {
    constructor() {
      this.isActive = false;
      this.lastUrl = '';
      this.modalDetector = new ModalDetector();
      this.buttonManager = new ButtonManager();
      this.timerManager = new TimerManager();
      this.observer = null;
    }

    updatePauseState() {
      const wantPause = this.modalDetector.shouldPause();
      if (wantPause === this.timerManager.isPaused) return;

      if (wantPause) {
        const remainingSeconds = this.timerManager.deadline > 0
          ? Math.max(0, Math.round((this.timerManager.deadline - Date.now()) / 1000))
          : CONFIG.INTERVAL_SEC;
        
        this.timerManager.pause(remainingSeconds);
        this.buttonManager.updateText(remainingSeconds, true);
      } else {
        const remainingSeconds = this.timerManager.resume();
        this.buttonManager.updateText(remainingSeconds, false);
      }
    }

    async updateLoop() {
      const button = DOMHelper.findSaveButton();
      const currentUrl = window.location.href;
      
      if (currentUrl !== this.lastUrl) {
        this.lastUrl = currentUrl;
      }

      this.updatePauseState();
      this.buttonManager.updateButton(button);

      if (!this.buttonManager.currentButton) {
        this.startSearchMode();
        return;
      }

      const timeLeft = this.timerManager.getTimeLeft();
      this.buttonManager.updateText(timeLeft, this.timerManager.isPaused);

      if (this.timerManager.isTimeUp()) {
        const success = await this.buttonManager.performSave();
        if (success) {
          this.timerManager.scheduleNext();
          this.buttonManager.updateText(CONFIG.INTERVAL_SEC, false);
        } else {
          this.timerManager.deadline = Date.now() + CONFIG.RETRY_DELAY;
        }
      }
    }

    startSearchMode() {
      if (!this.isActive) return;
      
      this.timerManager.stopTimers();
      this.timerManager.searchId = setInterval(() => {
        const button = DOMHelper.findSaveButton();
        if (button) {
          this.buttonManager.updateButton(button);
          this.startMainMode();
        }
      }, CONFIG.SEARCH_INTERVAL);
    }

    startMainMode() {
      if (!this.isActive) return;
      
      this.timerManager.stopTimers();
      
      // Если стартуем при открытой модалке — сразу ставим на паузу
      if (this.modalDetector.shouldPause()) {
        this.timerManager.pause(CONFIG.INTERVAL_SEC);
      } else {
        this.timerManager.scheduleNext();
      }

      this.timerManager.tickId = setInterval(() => this.updateLoop(), CONFIG.UPDATE_INTERVAL);
      this.updateLoop();
    }

    setupUrlChangeHandler() {
      // Проверяем поддержку History API для Safari
      if (typeof history === 'undefined' || !history.pushState || !history.replaceState) {
        console.warn('[n8n-autosave] History API not fully supported, URL change detection disabled');
        return;
      }
      
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      history.pushState = (...args) => {
        try {
          originalPushState.apply(history, args);
          setTimeout(() => this.updatePauseState(), 50);
        } catch (error) {
          console.error('[n8n-autosave] Error in pushState:', error);
        }
      };
      
      history.replaceState = (...args) => {
        try {
          originalReplaceState.apply(history, args);
          setTimeout(() => this.updatePauseState(), 50);
        } catch (error) {
          console.error('[n8n-autosave] Error in replaceState:', error);
        }
      };
      
      window.addEventListener('popstate', () => {
        setTimeout(() => this.updatePauseState(), 50);
      });
    }

    setupMutationObserver() {
      // Проверяем поддержку MutationObserver для Safari
      if (typeof MutationObserver === 'undefined') {
        console.warn('[n8n-autosave] MutationObserver not supported, using fallback polling');
        // Fallback: простой polling для старых браузеров
        setInterval(() => {
          if (!this.isActive) return;
          this.updatePauseState();
          const button = DOMHelper.findSaveButton();
          if (button && button !== this.buttonManager.currentButton) {
            this.buttonManager.updateButton(button);
            const timeLeft = this.timerManager.getTimeLeft();
            this.buttonManager.updateText(timeLeft, this.timerManager.isPaused);
          }
        }, 1000);
        return;
      }

      this.observer = new MutationObserver(() => {
        if (!this.isActive) return;
        
        this.updatePauseState();
        const button = DOMHelper.findSaveButton();
        
        if (button && button !== this.buttonManager.currentButton) {
          this.buttonManager.updateButton(button);
          const timeLeft = this.timerManager.getTimeLeft();
          this.buttonManager.updateText(timeLeft, this.timerManager.isPaused);
        }
      });

      this.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'class', 'style', 'aria-hidden']
      });
    }

    init() {
      this.isActive = true;
      this.lastUrl = window.location.href;
      
      this.setupUrlChangeHandler();
      this.setupMutationObserver();

      const button = DOMHelper.findSaveButton();
      if (button) {
        this.buttonManager.updateButton(button);
        this.startMainMode();
      } else {
        this.startSearchMode();
      }

      window.addEventListener('beforeunload', () => this.cleanup());

      console.log('[n8n-autosave] Initialized. Interval:', CONFIG.INTERVAL_SEC, 's');
      console.log('[n8n-autosave] Pause detection: editor url, node-creator, element-ui overlays, body lock (debounced).');
    }

    cleanup() {
      this.isActive = false;
      this.timerManager.stopTimers();
      this.buttonManager.restoreText();
      this.observer?.disconnect();
    }
  }

  // === ЗАПУСК ===
  const app = new AutoSaveApp();
  
  // Улучшенная инициализация для совместимости с разными менеджерами
  const initApp = () => {
    try {
      // Дополнительная проверка для Safari/Userscripts
      if (typeof document === 'undefined' || !document.querySelector) {
        console.error('[n8n-autosave] DOM not ready or not supported');
        return;
      }
      
      app.init();
      console.log('[n8n-autosave] Successfully initialized on', navigator.userAgent.includes('Safari') ? 'Safari' : 'browser');
    } catch (error) {
      console.error('[n8n-autosave] Initialization error:', error);
      // Повторная попытка через 3 секунды для Safari
      setTimeout(() => {
        try {
          app.init();
        } catch (retryError) {
          console.error('[n8n-autosave] Retry failed:', retryError);
        }
      }, 3000);
    }
  };
  
  // Более надежная проверка готовности для Safari
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else if (document.readyState === 'interactive') {
    // Дополнительная задержка для Safari Userscripts
    setTimeout(initApp, navigator.userAgent.includes('Safari') ? 500 : 100);
  } else {
    initApp();
  }
})();
