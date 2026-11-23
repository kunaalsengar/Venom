/**
 * PROJECT NEXUS — Decoupled EventBus
 * Lightweight publish-subscribe event system for discrete application lifecycle transitions.
 *
 * @module core/EventBus
 */

/**
 * Standard typed event identifier constants
 */
export const Events = Object.freeze({
  // Gesture Events
  GESTURE_CHANGE: 'gesture:change',
  GESTURE_DETECTED: 'gesture:detected',
  PINCH_START: 'gesture:pinch_start',
  PINCH_END: 'gesture:pinch_end',
  SWIPE: 'gesture:swipe',
  FINGER_CHANGE: 'gesture:finger_change',

  // Advanced Combination Events (Phase 3, Step 3.3)
  GESTURE_COMBINATION_START: 'gesture:combination_start',
  GESTURE_COMBINATION_END: 'gesture:combination_end',
  PINCH_HOLD_START: 'gesture:pinch_hold_start',
  PINCH_HOLD_END: 'gesture:pinch_hold_end',
  DOUBLE_PINCH: 'gesture:double_pinch',
  PEACE_SIGN_HOLD: 'gesture:peace_sign_hold',
  POINTING: 'gesture:pointing',
  THREE_FINGER: 'gesture:three_finger',
  BOTH_HANDS_PINCH_START: 'gesture:both_hands_pinch_start',
  BOTH_HANDS_PINCH_END: 'gesture:both_hands_pinch_end',

  // Semantic Action Events (Phase 3, Step 3.3)
  ACTION_TRIGGERED: 'action:triggered',

  // Tracking & Camera Events
  HAND_ACQUIRED: 'tracking:hand_acquired',
  HAND_LOST: 'tracking:hand_lost',
  CAMERA_STATUS: 'camera:status',
  TRACKING_MODE_CHANGE: 'tracking:mode_change',
  TRACKER_INITIALIZED: 'tracking:initialized',
  TRACKER_ERROR: 'tracking:error',

  // UI & Experience Mode Events
  MODE_CHANGE: 'mode:change',
  HUD_TOGGLE: 'hud:toggle',
  NOTIFICATION: 'ui:notification',

  // Holographic Interface Events (Phase 4, Step 4.1)
  HOLOGRAM_TOGGLE: 'hologram:toggle',
  HOLOGRAM_VISIBILITY: 'hologram:visibility',
  HOLOGRAM_OPACITY: 'hologram:opacity',
  HOLOGRAM_QUALITY: 'hologram:quality',

  // Dual-Hand 3D Interaction Events (Phase 4, Step 4.2)
  INTERACTION_HAND_TRACKED: 'interaction:hand_tracked',
  INTERACTION_HAND_LOST: 'interaction:hand_lost',
  INTERACTION_TWO_HAND_START: 'interaction:two_hand_start',
  INTERACTION_TWO_HAND_UPDATE: 'interaction:two_hand_update',
  INTERACTION_TWO_HAND_END: 'interaction:two_hand_end',

  // Gesture-Controlled Holographic Objects (Phase 4, Step 4.3)
  HOLOGRAM_OBJECT_HOVER: 'hologram:object_hover',
  HOLOGRAM_OBJECT_UNHOVER: 'hologram:object_unhover',
  HOLOGRAM_OBJECT_SELECTED: 'hologram:object_selected',
  HOLOGRAM_OBJECT_RELEASED: 'hologram:object_released',
  HOLOGRAM_OBJECT_ACTIVATED: 'hologram:object_activated',

  // Performance & System Events
  FPS_UPDATE: 'perf:fps_update',
  RES_SCALE_CHANGE: 'rendering:res_scale_change',
  ERROR: 'system:error'
});

/**
 * EventBus Implementation
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe a callback to an event
   * @param {string} event - Event name from Events constant
   * @param {Function} handler - Callback invoked with event payload
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    if (typeof handler !== 'function') {
      console.warn(`[EventBus] Handler for event "${event}" is not a function.`);
      return () => {};
    }
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Subscribe a callback that fires once and removes itself
   * @param {string} event
   * @param {Function} handler
   * @returns {Function} Unsubscribe function
   */
  once(event, handler) {
    const wrapper = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    return this.on(event, wrapper);
  }

  /**
   * Remove a registered handler for an event
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    if (!this._listeners.has(event)) return;
    this._listeners.get(event).delete(handler);
    if (this._listeners.get(event).size === 0) {
      this._listeners.delete(event);
    }
  }

  /**
   * Synchronously dispatch an event to all subscribers
   * @param {string} event
   * @param {*} [payload]
   */
  emit(event, payload) {
    if (!this._listeners.has(event)) return;
    const handlers = Array.from(this._listeners.get(event));
    for (let i = 0; i < handlers.length; i++) {
      try {
        handlers[i](payload);
      } catch (err) {
        console.error(`[EventBus] Error in handler for event "${event}":`, err);
      }
    }
  }

  /**
   * Clear all handlers for a given event, or all registered handlers
   * @param {string} [event]
   */
  clear(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }
}

/**
 * Singleton instance of EventBus
 */
export const eventBus = new EventBus();
