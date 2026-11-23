/**
 * PROJECT NEXUS — Custom Gesture Mapping Engine (Phase 3, Step 3.3)
 *
 * Provides a decoupled semantic mapping layer that translates raw gesture events
 * into high-level application actions (e.g., SELECT, DOUBLE_SELECT, POINT, TWO_HAND_CONTROL).
 *
 * Features:
 * - Dynamic registration, unregistration, and toggling of gesture-to-action bindings.
 * - Priority-based arbitration when multiple gestures occur simultaneously.
 * - Mutual exclusivity enforcement to suppress conflicting secondary actions.
 * - Per-action cooldown timers to prevent rapid duplicate action executions.
 * - Reactive EventBus integration (emits Events.ACTION_TRIGGERED with rich payloads).
 * - Safe declarative execution (no unsafe dynamic code or arbitrary function execution).
 *
 * @module gestures/GestureMapper
 */

import { AppConfig } from '../config/AppConfig.js';
import { stateManager } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';

export class GestureMapper {
  constructor() {
    this._cfg = AppConfig.gestureMapping || { enabled: true, defaultActionCooldownMs: 250, mappings: [] };
    this._enabled = this._cfg.enabled !== false;

    /** @type {Map<string, Object>} Key: gesture event name string */
    this._mappings = new Map();

    /** @type {Map<string, number>} Key: action name -> last execution timestamp */
    this._actionCooldowns = new Map();

    /** @type {Map<string, Function>} Key: event name -> unsubscribe function */
    this._subscriptions = new Map();

    this._activeAction = null;
    this._activeActionTimestamp = 0;
    this._activeActionPriority = -1;

    // Initialize default mappings from configuration
    this._initDefaultMappings();
  }

  /**
   * Initialize default bindings from AppConfig
   * @private
   */
  _initDefaultMappings() {
    const list = this._cfg.mappings || [];
    for (const m of list) {
      this.registerMapping(m);
    }
  }

  /**
   * Register a new gesture-to-action mapping
   *
   * @param {Object} mapping
   * @param {string} mapping.gesture - Gesture event name constant or string identifier
   * @param {string} mapping.action - Semantic action name (e.g., 'SELECT', 'POINT')
   * @param {number} [mapping.priority=10] - Higher values take precedence
   * @param {boolean} [mapping.enabled=true] - Initial active status
   * @param {boolean} [mapping.exclusive=true] - When true, suppresses lower-priority actions
   * @param {number} [mapping.cooldownMs=250] - Minimum duration before action can fire again
   * @returns {boolean} Success status
   */
  registerMapping(mapping) {
    if (!mapping || !mapping.gesture || !mapping.action) {
      console.warn('[GestureMapper] Invalid mapping definition rejected:', mapping);
      return false;
    }

    const eventName = this._resolveEventName(mapping.gesture);
    if (!eventName) {
      console.warn('[GestureMapper] Unknown event constant or name for gesture:', mapping.gesture);
      return false;
    }

    const entry = {
      gesture: mapping.gesture,
      eventName,
      action: mapping.action,
      priority: typeof mapping.priority === 'number' ? mapping.priority : 10,
      enabled: mapping.enabled !== false,
      exclusive: mapping.exclusive !== false,
      cooldownMs: typeof mapping.cooldownMs === 'number' ? mapping.cooldownMs : (this._cfg.defaultActionCooldownMs || 250)
    };

    this._mappings.set(eventName, entry);

    // Subscribe to EventBus if not already listening to this event
    if (!this._subscriptions.has(eventName)) {
      const unsub = eventBus.on(eventName, (payload) => {
        this._handleGestureEvent(eventName, payload);
      });
      this._subscriptions.set(eventName, unsub);
    }

    this._syncState();
    return true;
  }

  /**
   * Resolve gesture string identifier to the corresponding EventBus event name
   * @private
   * @param {string} gestureIdentifier
   * @returns {string|null}
   */
  _resolveEventName(gestureIdentifier) {
    // Check if it directly matches a constant in Events
    if (Events[gestureIdentifier]) return Events[gestureIdentifier];

    // Check if it matches an existing event value
    for (const [k, v] of Object.entries(Events)) {
      if (v === gestureIdentifier || k === gestureIdentifier) return v;
    }

    // Direct string fallback
    return gestureIdentifier;
  }

  /**
   * Handle an incoming gesture event from EventBus
   * @private
   * @param {string} eventName
   * @param {Object} payload
   */
  _handleGestureEvent(eventName, payload) {
    if (!this._enabled) return;

    const mapping = this._mappings.get(eventName);
    if (!mapping || !mapping.enabled) return;

    const currentTimeMs = (payload && payload.timestamp) ? payload.timestamp : performance.now();

    // Check action cooldown
    const lastTriggered = this._actionCooldowns.get(mapping.action) || 0;
    if (currentTimeMs - lastTriggered < mapping.cooldownMs) {
      return; // Cooldown still active
    }

    // Check exclusivity and priority
    if (mapping.exclusive && this._activeAction && this._activeAction !== mapping.action) {
      const timeSinceActive = currentTimeMs - this._activeActionTimestamp;
      if (timeSinceActive < 200 && this._activeActionPriority > mapping.priority) {
        return; // Suppressed by higher priority active action
      }
    }

    // Commit semantic action
    this._actionCooldowns.set(mapping.action, currentTimeMs);
    this._activeAction = mapping.action;
    this._activeActionTimestamp = currentTimeMs;
    this._activeActionPriority = mapping.priority;

    stateManager.setSemanticAction(mapping.action, {
      gesture: mapping.gesture,
      hand: payload?.hand || 'primary',
      timestamp: currentTimeMs,
      priority: mapping.priority
    });

    // Emit typed action event through EventBus
    eventBus.emit(Events.ACTION_TRIGGERED, {
      action: mapping.action,
      gesture: mapping.gesture,
      eventName,
      hand: payload?.hand || 'primary',
      priority: mapping.priority,
      timestamp: currentTimeMs,
      payload
    });
  }

  /**
   * Unregister an existing mapping by gesture identifier
   * @param {string} gestureIdentifier
   * @returns {boolean}
   */
  unregisterMapping(gestureIdentifier) {
    const eventName = this._resolveEventName(gestureIdentifier);
    if (!eventName || !this._mappings.has(eventName)) return false;

    this._mappings.delete(eventName);

    // If no other mapping uses this event, unsubscribe from EventBus
    const unsub = this._subscriptions.get(eventName);
    if (unsub) {
      unsub();
      this._subscriptions.delete(eventName);
    }

    this._syncState();
    return true;
  }

  /**
   * Enable or disable an individual mapping
   * @param {string} gestureIdentifier
   * @param {boolean} enabled
   * @returns {boolean}
   */
  enableMapping(gestureIdentifier, enabled) {
    const eventName = this._resolveEventName(gestureIdentifier);
    if (!eventName || !this._mappings.has(eventName)) return false;

    this._mappings.get(eventName).enabled = Boolean(enabled);
    this._syncState();
    return true;
  }

  /**
   * Enable or disable the entire mapping engine
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._enabled = Boolean(enabled);
  }

  /**
   * Get all registered mapping entries
   * @returns {Array<Object>}
   */
  getMappings() {
    return Array.from(this._mappings.values());
  }

  /**
   * Check if a specific gesture mapping is currently enabled
   * @param {string} gestureIdentifier
   * @returns {boolean}
   */
  isMappingEnabled(gestureIdentifier) {
    const eventName = this._resolveEventName(gestureIdentifier);
    if (!eventName || !this._mappings.has(eventName)) return false;
    return this._mappings.get(eventName).enabled;
  }

  /**
   * Reset all mappings back to configuration defaults
   */
  resetMappings() {
    // Unsubscribe all active listeners
    for (const unsub of this._subscriptions.values()) {
      unsub();
    }
    this._subscriptions.clear();
    this._mappings.clear();
    this._actionCooldowns.clear();
    this._activeAction = null;
    this._activeActionTimestamp = 0;
    this._activeActionPriority = -1;

    // Re-initialize default mappings
    this._initDefaultMappings();
  }

  /**
   * Synchronize registered mappings with StateManager
   * @private
   */
  _syncState() {
    const mapObj = {};
    for (const [k, v] of this._mappings.entries()) {
      mapObj[v.gesture] = {
        action: v.action,
        enabled: v.enabled,
        priority: v.priority
      };
    }
    const target = stateManager.state.gestures.mapping;
    if (target) {
      target.activeMappingsCount = this._mappings.size;
      target.mappings = mapObj;
    }
  }
}

/**
 * Singleton instance of GestureMapper
 */
export const gestureMapper = new GestureMapper();

if (typeof window !== 'undefined' && !window.gestureMapper) {
  window.gestureMapper = gestureMapper;
}
