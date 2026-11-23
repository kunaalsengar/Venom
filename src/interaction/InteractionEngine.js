/**
 * PROJECT NEXUS — Dual-Hand 3D Interaction Engine
 * Master coordinator for independent dual-hand 3D interaction, spatial metrics,
 * cursor synchronization, and lifecycle event dispatching.
 *
 * Responsibilities:
 * - Orchestrates independent left and right HandControllers.
 * - Computes real-time two-hand interaction metrics (distance, midpoint, deltas, span ratio).
 * - Dispatches typed EventBus events on acquisition, loss, and dual-hand interaction.
 * - Synchronizes with StateManager for zero-allocation property traversal.
 * - Mounts 3D holographic cursors onto the active HologramScene.
 *
 * @module interaction/InteractionEngine
 */

import { HandController } from './HandController.js';
import { TwoHandMetrics } from './TwoHandMetrics.js';
import { AppConfig } from '../config/AppConfig.js';
import { eventBus, Events } from '../core/EventBus.js';
import { stateManager } from '../core/StateManager.js';

export class InteractionEngine {
  constructor() {
    this._cfg = AppConfig.interaction;

    // Independent 3D controllers for both hands
    this.controllers = {
      left: new HandController('left'),
      right: new HandController('right')
    };

    // Dual-hand spatial metrics calculator
    this.twoHandMetrics = new TwoHandMetrics();

    // Internal state tracking for lifecycle transitions
    this._wasLeftTracked = false;
    this._wasRightTracked = false;
    this._wasTwoHandActive = false;
    this._isInitialized = false;

    this._hologramScene = null;
    this._camera = null;
  }

  /**
   * Readiness flag accessor
   * @returns {boolean}
   */
  get isReady() {
    return this._isInitialized;
  }

  /**
   * Left hand controller accessor
   * @returns {HandController}
   */
  get left() {
    return this.controllers.left;
  }

  /**
   * Right hand controller accessor
   * @returns {HandController}
   */
  get right() {
    return this.controllers.right;
  }

  /**
   * Initialize interaction engine and mount holographic cursors to scene
   * @param {import('../hologram/HologramScene.js').HologramScene} hologramScene
   * @param {THREE.Camera} camera
   * @returns {this}
   */
  init(hologramScene, camera) {
    if (this._isInitialized) {
      console.warn('[InteractionEngine] Already initialized.');
      return this;
    }

    this._hologramScene = hologramScene;
    this._camera = camera;

    // Mount 3D holographic cursors into the holographic scene graph
    if (hologramScene) {
      hologramScene.register('cursor_left', this.controllers.left.cursor);
      hologramScene.register('cursor_right', this.controllers.right.cursor);
    }

    this._isInitialized = true;
    return this;
  }

  /**
   * Per-frame update called inside the primary 60 FPS animation loop.
   * ZERO HEAP ALLOCATIONS.
   *
   * @param {Object} hands - Container of { left, right } hands from LandmarkProcessor
   * @param {number} dt - Frame delta time in seconds
   * @param {number} currentTimeMs - Current timestamp in milliseconds
   */
  update(hands, dt, currentTimeMs) {
    if (!this._isInitialized || !this._cfg.enabled) return;

    const leftHand = hands ? hands.left : null;
    const rightHand = hands ? hands.right : null;

    // 1. Update independent 3D controllers
    this.controllers.left.update(leftHand, dt, currentTimeMs);
    this.controllers.right.update(rightHand, dt, currentTimeMs);

    // 2. Compute dual-hand spatial metrics
    const metrics = this.twoHandMetrics.compute(this.controllers.left, this.controllers.right);

    // 3. Detect and emit tracking lifecycle transitions
    this._handleLifecycleTransitions(metrics);

    // 4. Synchronize with StateManager
    this._syncStateManager(metrics);
  }

  /**
   * Emit discrete lifecycle events when tracking states transition
   * @private
   * @param {Object} metrics
   */
  _handleLifecycleTransitions(metrics) {
    const leftTracked = this.controllers.left.detected;
    const rightTracked = this.controllers.right.detected;
    const twoHandActive = metrics.available;

    // Left hand transition
    if (leftTracked !== this._wasLeftTracked) {
      this._wasLeftTracked = leftTracked;
      if (leftTracked) {
        eventBus.emit(Events.INTERACTION_HAND_TRACKED, {
          hand: 'left',
          position: this.controllers.left.position
        });
      } else {
        eventBus.emit(Events.INTERACTION_HAND_LOST, { hand: 'left' });
      }
    }

    // Right hand transition
    if (rightTracked !== this._wasRightTracked) {
      this._wasRightTracked = rightTracked;
      if (rightTracked) {
        eventBus.emit(Events.INTERACTION_HAND_TRACKED, {
          hand: 'right',
          position: this.controllers.right.position
        });
      } else {
        eventBus.emit(Events.INTERACTION_HAND_LOST, { hand: 'right' });
      }
    }

    // Two-hand interaction transitions
    if (twoHandActive !== this._wasTwoHandActive) {
      this._wasTwoHandActive = twoHandActive;
      if (twoHandActive) {
        eventBus.emit(Events.INTERACTION_TWO_HAND_START, {
          distance: metrics.distance,
          midpoint: metrics.midpoint,
          spanRatio: metrics.spanRatio
        });
      } else {
        eventBus.emit(Events.INTERACTION_TWO_HAND_END, {});
      }
    } else if (twoHandActive) {
      eventBus.emit(Events.INTERACTION_TWO_HAND_UPDATE, {
        distance: metrics.distance,
        midpoint: metrics.midpoint,
        deltaX: metrics.deltaX,
        deltaY: metrics.deltaY,
        deltaZ: metrics.deltaZ,
        spanRatio: metrics.spanRatio
      });
    }
  }

  /**
   * Synchronize controller and two-hand metrics with StateManager
   * @private
   * @param {Object} metrics
   */
  _syncStateManager(metrics) {
    if (!stateManager) return;

    for (const side of ['left', 'right']) {
      const ctrl = this.controllers[side];
      stateManager.updateInteractionController(side, {
        detected: ctrl.detected,
        visible: ctrl.cursor.visible,
        confidence: ctrl.confidence,
        position: ctrl.position,
        palmCenter: ctrl.palmCenter,
        indexTip: ctrl.indexTip,
        pinchPoint: ctrl.pinchPoint,
        velocity: ctrl.velocity,
        speed: ctrl.speed,
        gesture: ctrl.gesture,
        isPinching: ctrl.isPinching,
        pinchDistance: ctrl.pinchDistance,
        cursorOpacity: ctrl.cursor.opacity
      });
    }

    stateManager.updateTwoHandMetrics(metrics);
  }

  /**
   * Return comprehensive runtime telemetry for debugging and HUD displays
   * @returns {Object}
   */
  getStats() {
    return {
      isReady: this._isInitialized,
      left: {
        detected: this.controllers.left.detected,
        visible: this.controllers.left.cursor.visible,
        confidence: this.controllers.left.confidence,
        position: {
          x: Number(this.controllers.left.position.x.toFixed(3)),
          y: Number(this.controllers.left.position.y.toFixed(3)),
          z: Number(this.controllers.left.position.z.toFixed(3))
        },
        gesture: this.controllers.left.gesture,
        isPinching: this.controllers.left.isPinching
      },
      right: {
        detected: this.controllers.right.detected,
        visible: this.controllers.right.cursor.visible,
        confidence: this.controllers.right.confidence,
        position: {
          x: Number(this.controllers.right.position.x.toFixed(3)),
          y: Number(this.controllers.right.position.y.toFixed(3)),
          z: Number(this.controllers.right.position.z.toFixed(3))
        },
        gesture: this.controllers.right.gesture,
        isPinching: this.controllers.right.isPinching
      },
      twoHand: {
        available: this.twoHandMetrics.metrics.available,
        distance: Number(this.twoHandMetrics.metrics.distance.toFixed(3)),
        midpoint: {
          x: Number(this.twoHandMetrics.metrics.midpoint.x.toFixed(3)),
          y: Number(this.twoHandMetrics.metrics.midpoint.y.toFixed(3)),
          z: Number(this.twoHandMetrics.metrics.midpoint.z.toFixed(3))
        },
        spanRatio: Number(this.twoHandMetrics.metrics.spanRatio.toFixed(3))
      }
    };
  }
}

/**
 * Singleton instance of InteractionEngine
 */
export const interactionEngine = new InteractionEngine();

// Expose safe global debug reference for browser console inspection
if (typeof window !== 'undefined' && !window.interactionEngine) {
  window.interactionEngine = interactionEngine;
}
