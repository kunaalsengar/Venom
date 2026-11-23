/**
 * PROJECT NEXUS — Reusable UIManager
 * Manages HUD presentation, telemetry updates, notification banners,
 * experience mode cards, and controls in synchronization with StateManager and EventBus.
 *
 * @module ui/UIManager
 */

import { Events, eventBus } from '../core/EventBus.js';
import { stateManager } from '../core/StateManager.js';
import { AppConfig } from '../config/AppConfig.js';

export class UIManager {
  constructor() {
    this._initialized = false;

    // Cached DOM elements
    this.elements = {
      hud: null,
      loadingOverlay: null,
      loadingDesc: null,
      statusBanner: null,
      statusText: null,
      fpsDisplay: null,
      gestureDisplay: null,
      trackingDisplay: null,
      toggleFallbackBtn: null,
      cameraStatusPill: null,
      handPresenceText: null,
      handScaleDisplay: null,
      depthDisplay: null,
      activeModeTag: null,
      hudToggleBtn: null,
      modeCards: []
    };
  }

  /**
   * Query and cache DOM references and bind event listeners
   * @param {Object} [callbacks={}]
   * @param {Function} [callbacks.onToggleFallback]
   * @param {Function} [callbacks.onToggleHud]
   * @param {Function} [callbacks.onModeChange]
   */
  init(callbacks = {}) {
    if (this._initialized) return;

    // Cache elements
    this.elements.hud = document.getElementById('hud');
    this.elements.loadingOverlay = document.getElementById('loading-overlay');
    this.elements.loadingDesc = document.getElementById('loading-desc');
    this.elements.statusBanner = document.getElementById('status-banner');
    this.elements.statusText = document.getElementById('status-text');
    this.elements.fpsDisplay = document.getElementById('fps-display');
    this.elements.gestureDisplay = document.getElementById('gesture-display');
    this.elements.trackingDisplay = document.getElementById('tracking-display');
    this.elements.toggleFallbackBtn = document.getElementById('toggle-fallback-btn');
    this.elements.cameraStatusPill = document.getElementById('camera-status-pill');
    this.elements.handPresenceText = document.getElementById('hand-presence-text');
    this.elements.handScaleDisplay = document.getElementById('hand-scale-display');
    this.elements.depthDisplay = document.getElementById('depth-display');
    this.elements.activeModeTag = document.getElementById('active-mode-tag');
    this.elements.hudToggleBtn = document.getElementById('hud-toggle-btn');
    this.elements.modeCards = Array.from(document.querySelectorAll('.nexus-mode-card:not(.disabled)'));

    // Bind HUD toggle button
    if (this.elements.hudToggleBtn) {
      this.elements.hudToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.currentTarget && typeof e.currentTarget.blur === 'function') {
          e.currentTarget.blur();
        }
        const nextVisible = stateManager.toggleHud();
        if (callbacks.onToggleHud) callbacks.onToggleHud(nextVisible);
      });
    }

    // Bind Toggle Fallback button
    if (this.elements.toggleFallbackBtn) {
      this.elements.toggleFallbackBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.currentTarget && typeof e.currentTarget.blur === 'function') {
          e.currentTarget.blur();
        }
        const nextFallback = !stateManager.state.tracking.isMouseFallback;
        if (callbacks.onToggleFallback) {
          callbacks.onToggleFallback(nextFallback);
        } else {
          stateManager.setMouseFallback(nextFallback, nextFallback ? 'Mouse fallback toggled by user' : 'Camera tracking restored');
        }
      });
    }

    // Bind Experience Mode cards
    this.elements.modeCards.forEach((card) => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        const modeId = card.getAttribute('data-mode');
        if (!modeId) return;

        stateManager.setMode(modeId);
        if (callbacks.onModeChange) callbacks.onModeChange(modeId);
      });
    });

    // Subscribe to EventBus notifications
    this._subscribeEvents();

    this._initialized = true;
  }

  /**
   * Subscribe to discrete EventBus events for automated UI synchronization
   * @private
   */
  _subscribeEvents() {
    // Mode transitions
    eventBus.on(Events.MODE_CHANGE, ({ activeMode, name }) => {
      this.setActiveModeCard(activeMode);
      if (this.elements.activeModeTag) {
        this.elements.activeModeTag.textContent = name.toUpperCase();
      }
    });

    // Tracking mode changes (camera vs mouse)
    eventBus.on(Events.TRACKING_MODE_CHANGE, ({ isMouseFallback, reason }) => {
      if (isMouseFallback) {
        this.setTrackingMode('MOUSE FALLBACK', '#f59e0b', true);
        this.setCameraStatus(false);
        this.showNotification(reason || 'Mouse fallback active', 'warning');
      } else {
        this.setTrackingMode('WEBCAM', '#22d3ee', false);
        this.setCameraStatus(true);
        this.showNotification('Camera tracking restored.', 'info');
      }
    });

    // Camera status
    eventBus.on(Events.CAMERA_STATUS, ({ isActive, delegate }) => {
      this.setCameraStatus(isActive);
      if (isActive) {
        this.setTrackingMode(`WEBCAM (${delegate})`, '#22d3ee', false);
      }
    });

    // Notifications
    eventBus.on(Events.NOTIFICATION, ({ message, type }) => {
      this.showNotification(message, type);
      if (this.elements.loadingDesc) {
        this.elements.loadingDesc.textContent = message;
      }
    });

    // HUD toggle
    eventBus.on(Events.HUD_TOGGLE, ({ visible }) => {
      if (this.elements.hud) {
        this.elements.hud.classList.toggle('hidden', !visible);
      }
    });
  }

  /**
   * Update live telemetry displays in the HUD (designed for 60 FPS loop calls)
   * @param {Object} telemetry
   * @param {number} [telemetry.fps]
   * @param {boolean} [telemetry.handDetected]
   * @param {string} [telemetry.gesture]
   * @param {number} [telemetry.handSize]
   * @param {number} [telemetry.depthZ]
   */
  updateTelemetry({ fps, handDetected, gesture, handSize, depthZ }) {
    if (fps !== undefined && this.elements.fpsDisplay) {
      this.elements.fpsDisplay.textContent = `${fps} FPS`;
    }

    if (handDetected !== undefined && this.elements.handPresenceText) {
      const isString = typeof handDetected === 'string';
      const isDetected = Boolean(handDetected);
      this.elements.handPresenceText.textContent = isString ? handDetected : (isDetected ? 'DETECTED' : 'SCANNING');
      this.elements.handPresenceText.style.color = isDetected ? 'var(--status-green)' : 'var(--text-dim)';
    }

    if (gesture !== undefined && this.elements.gestureDisplay) {
      if (this.elements.gestureDisplay.textContent !== gesture) {
        this.elements.gestureDisplay.textContent = gesture;
        this.elements.gestureDisplay.className = `gesture-badge ${gesture.toLowerCase()}`;
      }
    }

    if (handSize !== undefined && this.elements.handScaleDisplay) {
      this.elements.handScaleDisplay.textContent = handSize.toFixed(2);
    }

    if (depthZ !== undefined && this.elements.depthDisplay) {
      this.elements.depthDisplay.textContent = depthZ.toFixed(2);
    }
  }

  /**
   * Update active mode card selection in the left panel
   * @param {string} modeId
   */
  setActiveModeCard(modeId) {
    this.elements.modeCards.forEach((c) => {
      const match = c.getAttribute('data-mode') === modeId;
      c.classList.toggle('active', match);
      const badge = c.querySelector('.nexus-mode-badge');
      if (badge) {
        badge.textContent = match ? 'ACTIVE' : 'READY';
      }
    });
  }

  /**
   * Update tracking display label and fallback button state
   * @param {string} label
   * @param {string} color
   * @param {boolean} isFallback
   */
  setTrackingMode(label, color = '#22d3ee', isFallback = false) {
    if (this.elements.trackingDisplay) {
      this.elements.trackingDisplay.textContent = label;
      this.elements.trackingDisplay.style.color = color;
    }
    if (this.elements.toggleFallbackBtn) {
      this.elements.toggleFallbackBtn.textContent = isFallback ? 'M: CAMERA' : 'M: MOUSE';
    }
  }

  /**
   * Update camera status pill in header
   * @param {boolean} isActive
   */
  setCameraStatus(isActive) {
    if (!this.elements.cameraStatusPill) return;
    if (isActive) {
      this.elements.cameraStatusPill.innerHTML = '<span>CAMERA: ACTIVE</span>';
      this.elements.cameraStatusPill.classList.add('nexus-pill-highlight');
    } else {
      this.elements.cameraStatusPill.innerHTML = '<span>CAMERA: OFF</span>';
      this.elements.cameraStatusPill.classList.remove('nexus-pill-highlight');
    }
  }

  /**
   * Display a status banner message
   * @param {string} message
   * @param {'info'|'warning'|'error'} [type='info']
   */
  showNotification(message, type = 'info') {
    if (!this.elements.statusBanner || !this.elements.statusText) return;

    this.elements.statusText.textContent = message;
    this.elements.statusBanner.classList.remove('warning', 'error');

    if (type === 'warning') {
      this.elements.statusBanner.classList.add('warning');
    } else if (type === 'error') {
      this.elements.statusBanner.classList.add('error');
    }
  }

  /**
   * Update loading screen message
   * @param {string} message
   */
  setLoadingMessage(message) {
    if (this.elements.loadingDesc) {
      this.elements.loadingDesc.textContent = message;
    }
  }

  /**
   * Hide the initial loading overlay
   */
  hideLoading() {
    if (this.elements.loadingOverlay) {
      this.elements.loadingOverlay.classList.add('hidden');
    }
  }
}

/**
 * Singleton instance of UIManager
 */
export const uiManager = new UIManager();
