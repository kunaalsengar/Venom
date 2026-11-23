/**
 * PROJECT NEXUS — Holographic Object Manager
 * Central coordinator for gesture-controlled holographic objects, spatial hit-testing,
 * dual-hand hover/selection lifecycle, pinch-and-drag translation, and action activation.
 *
 * Responsibilities:
 * - Manages registry of InteractableHologram entities.
 * - Spawns and mounts foundational interactive demo widgets (Data Prism, Hyper Cube, Power Orb).
 * - Executes zero-allocation proximity hit-testing independently for left and right hands.
 * - Handles targeting hysteresis to eliminate edge boundary flickering.
 * - Deterministic dual-hand conflict arbitration (first-hand ownership).
 * - Dispatches typed EventBus events on hover, unhover, select, release, and activate.
 * - Synchronizes with StateManager for real-time telemetry inspection.
 * - Exposes safe debug APIs on window.holographicObjectManager.
 *
 * @module interaction/HolographicObjectManager
 */

import * as THREE from 'three';
import { InteractableHologram } from '../hologram/InteractableHologram.js';
import { AppConfig } from '../config/AppConfig.js';
import { eventBus, Events } from '../core/EventBus.js';
import { stateManager } from '../core/StateManager.js';
import { dist3 } from '../utils/MathUtils.js';

export class HolographicObjectManager {
  constructor() {
    this._cfg = AppConfig.interaction.objects;

    /** @type {Map<string, InteractableHologram>} */
    this._objects = new Map();

    this._hologramScene = null;
    this._camera = null;
    this._isInitialized = false;

    // Per-hand tracking state for discrete transitions
    this._handState = {
      left: {
        hoveredId: null,
        selectedId: null,
        wasPinching: false,
        lastActionTimestamp: 0
      },
      right: {
        hoveredId: null,
        selectedId: null,
        wasPinching: false,
        lastActionTimestamp: 0
      }
    };
  }

  /**
   * Readiness flag accessor
   * @returns {boolean}
   */
  get isReady() {
    return this._isInitialized;
  }

  /**
   * Number of registered interactable objects
   * @returns {number}
   */
  get count() {
    return this._objects.size;
  }

  /**
   * Initialize manager and mount built-in demo objects onto HologramScene
   * @param {import('../hologram/HologramScene.js').HologramScene} hologramScene
   * @param {THREE.Camera} camera
   * @returns {this}
   */
  init(hologramScene, camera) {
    if (this._isInitialized) {
      console.warn('[HolographicObjectManager] Already initialized.');
      return this;
    }

    this._hologramScene = hologramScene;
    this._camera = camera;

    // Instantiate and register default interactive holographic objects
    this._initBuiltinObjects();

    this._isInitialized = true;
    return this;
  }

  /**
   * Create the default set of spaced 3D interactive holographic demo widgets
   * @private
   */
  _initBuiltinObjects() {
    // 1. Data Prism (Left widget)
    const prism = new InteractableHologram('obj_prism', {
      type: 'prism',
      label: 'DATA PRISM',
      position: [-1.35, 0.25, 0.0],
      interactionRadius: 0.38,
      onActivate: (obj, hand, gesture) => {
        stateManager.notify(`[${obj.label}] Activated by ${hand.toUpperCase()} hand (${gesture})`, 'info');
      }
    });

    // 2. Hyper Cube (Right widget)
    const cube = new InteractableHologram('obj_cube', {
      type: 'cube',
      label: 'HYPER CUBE',
      position: [1.35, 0.25, 0.0],
      interactionRadius: 0.38,
      onActivate: (obj, hand, gesture) => {
        stateManager.notify(`[${obj.label}] Activated by ${hand.toUpperCase()} hand (${gesture})`, 'info');
      }
    });

    // 3. Power Orb (Center-top elevated widget)
    const orb = new InteractableHologram('obj_orb', {
      type: 'orb',
      label: 'POWER ORB',
      position: [0.0, 1.25, -0.20],
      interactionRadius: 0.42,
      onActivate: (obj, hand, gesture) => {
        stateManager.notify(`[${obj.label}] Activated by ${hand.toUpperCase()} hand (${gesture})`, 'info');
      }
    });

    this.register(prism);
    this.register(cube);
    this.register(orb);
  }

  /**
   * Register an interactable holographic object
   * @param {InteractableHologram} object
   * @returns {InteractableHologram}
   */
  register(object) {
    if (!object || !(object instanceof InteractableHologram)) {
      console.warn('[HolographicObjectManager] Invalid object. Must extend InteractableHologram.');
      return null;
    }

    if (this._objects.has(object.id)) {
      console.warn(`[HolographicObjectManager] Object "${object.id}" is already registered.`);
      return this._objects.get(object.id);
    }

    this._objects.set(object.id, object);

    // Mount onto the active HologramScene if ready
    if (this._hologramScene) {
      this._hologramScene.register(object.id, object);
    }

    // Update StateManager summary item
    stateManager.updateHologramObjectItem(object.id, {
      id: object.id,
      label: object.label,
      type: object.type,
      state: object.state,
      hoveringHand: object.hoveringHand,
      selectingHand: object.selectingHand
    });

    return object;
  }

  /**
   * Unregister and dispose an interactable object
   * @param {string} id
   * @returns {boolean}
   */
  unregister(id) {
    const obj = this._objects.get(id);
    if (!obj) return false;

    if (this._hologramScene) {
      this._hologramScene.unregister(id);
    }

    obj.dispose();
    this._objects.delete(id);
    return true;
  }

  /**
   * Retrieve an interactable object by ID
   * @param {string} id
   * @returns {InteractableHologram|null}
   */
  get(id) {
    return this._objects.get(id) || null;
  }

  /**
   * Per-frame zero-allocation update loop called in primary animation loop.
   *
   * @param {{ left: import('./HandController.js').HandController, right: import('./HandController.js').HandController }} controllers
   * @param {number} dt - Frame delta time in seconds
   * @param {number} currentTimeMs - Current timestamp in milliseconds
   */
  update(controllers, dt, currentTimeMs) {
    if (!this._isInitialized) return;

    const time = currentTimeMs * 0.001;

    // 1. Process interactions independently for each hand
    if (controllers) {
      this._processHandInteraction('left', controllers.left, dt, currentTimeMs);
      this._processHandInteraction('right', controllers.right, dt, currentTimeMs);
    }

    // 2. Update all registered holographic objects
    for (const obj of this._objects.values()) {
      obj.update(time, dt, currentTimeMs);

      // Keep StateManager summary current
      stateManager.updateHologramObjectItem(obj.id, {
        state: obj.state,
        hoveringHand: obj.hoveringHand,
        selectingHand: obj.selectingHand
      });
    }
  }

  /**
   * Evaluate proximity hit-testing, selection, drag, and activation for one hand
   * @private
   * @param {'left'|'right'} side
   * @param {import('./HandController.js').HandController} controller
   * @param {number} dt
   * @param {number} currentTimeMs
   */
  _processHandInteraction(side, controller, dt, currentTimeMs) {
    const hState = this._handState[side];

    if (!controller || !controller.detected) {
      // If hand lost tracking, cleanly release any held selection & clear hover
      if (hState.selectedId) {
        this._releaseSelection(side, hState.selectedId);
      }
      if (hState.hoveredId) {
        this._clearHover(side, hState.hoveredId);
      }
      hState.wasPinching = false;
      return;
    }

    const cPos = controller.position;
    const isPinching = controller.isPinching;
    const gesture = controller.gesture;

    // -------------------------------------------------------------------------
    // A. DRAGGING ACTIVE SELECTION
    // -------------------------------------------------------------------------
    if (hState.selectedId) {
      const selectedObj = this._objects.get(hState.selectedId);
      if (selectedObj && selectedObj.selectingHand === side) {
        if (isPinching) {
          // Drag object to match controller movement
          selectedObj.dragTo(cPos, dt);
        } else {
          // Pinch ended -> naturally release selection
          this._releaseSelection(side, hState.selectedId);
        }
      } else {
        // Selection was lost or taken over
        hState.selectedId = null;
        stateManager.setHologramObjectSelected(side, null);
      }
    }

    // -------------------------------------------------------------------------
    // B. PROXIMITY HIT-TESTING & HOVER EVALUATION
    // -------------------------------------------------------------------------
    let closestObj = null;
    let minDistance = Infinity;
    const tolerance = this._cfg.targetingTolerance || 0.08;

    if (hState.selectedId) {
      // While dragging an active selection, maintain focus on the selected object
      closestObj = this._objects.get(hState.selectedId);
      minDistance = closestObj ? dist3(cPos, closestObj.position) : 0;
    } else {
      for (const obj of this._objects.values()) {
        const d = dist3(cPos, obj.position);
        const isCurrentlyHoveredByThisHand = (hState.hoveredId === obj.id);

        // Apply hysteresis: widen detection threshold if already hovering this object
        const effectiveRadius = obj.interactionRadius + (isCurrentlyHoveredByThisHand ? tolerance : 0.0);

        if (d <= effectiveRadius && d < minDistance) {
          minDistance = d;
          closestObj = obj;
        }
      }
    }

    const nextHoveredId = closestObj ? closestObj.id : null;

    // Handle Hover Exit
    if (hState.hoveredId && hState.hoveredId !== nextHoveredId) {
      this._clearHover(side, hState.hoveredId);
    }

    // Handle Hover Enter / Continuation
    if (nextHoveredId) {
      if (hState.hoveredId !== nextHoveredId) {
        hState.hoveredId = nextHoveredId;
        closestObj.setHover(true, side);
        stateManager.setHologramObjectHover(side, nextHoveredId);
        eventBus.emit(Events.HOLOGRAM_OBJECT_HOVER, {
          id: nextHoveredId,
          hand: side,
          distance: minDistance
        });
      }

      // -----------------------------------------------------------------------
      // C. PINCH SELECTION TRIGGER
      // -------------------------------------------------------------------------
      const pinchStarted = isPinching && !hState.wasPinching;
      if (pinchStarted && !hState.selectedId) {
        // Deterministic arbitration: can only select if not already held by the other hand
        if (!closestObj.selectingHand) {
          hState.selectedId = nextHoveredId;
          closestObj.setSelected(true, side, cPos);
          stateManager.setHologramObjectSelected(side, nextHoveredId);
          eventBus.emit(Events.HOLOGRAM_OBJECT_SELECTED, {
            id: nextHoveredId,
            hand: side,
            position: closestObj.position
          });
        }
      }

      // Check for gestural action activation while hovering (e.g. FIST or SPREAD)
      // Only evaluate when NOT pinching to prevent race conditions during pinch-selection
      if (!isPinching && (gesture === 'FIST' || gesture === 'SPREAD') &&
          currentTimeMs - hState.lastActionTimestamp > (this._cfg.actionCooldownMs || 250)) {
        hState.lastActionTimestamp = currentTimeMs;
        closestObj.activate(side, gesture, currentTimeMs);
        eventBus.emit(Events.HOLOGRAM_OBJECT_ACTIVATED, {
          id: closestObj.id,
          hand: side,
          gesture: gesture
        });
      }
    }

    hState.wasPinching = isPinching;
  }

  /**
   * Clear hover state for a hand and object
   * @private
   * @param {'left'|'right'} side
   * @param {string} objectId
   */
  _clearHover(side, objectId) {
    const obj = this._objects.get(objectId);
    if (obj && obj.hoveringHand === side) {
      obj.setHover(false, side);
    }
    this._handState[side].hoveredId = null;
    stateManager.setHologramObjectHover(side, null);
    eventBus.emit(Events.HOLOGRAM_OBJECT_UNHOVER, { id: objectId, hand: side });
  }

  /**
   * Release selection for a hand and object
   * @private
   * @param {'left'|'right'} side
   * @param {string} objectId
   */
  _releaseSelection(side, objectId) {
    const obj = this._objects.get(objectId);
    if (obj && obj.selectingHand === side) {
      obj.setSelected(false, side);
    }
    this._handState[side].selectedId = null;
    stateManager.setHologramObjectSelected(side, null);
    eventBus.emit(Events.HOLOGRAM_OBJECT_RELEASED, { id: objectId, hand: side });
  }

  /**
   * Reset all interactable objects to their default positions
   */
  resetAllPositions() {
    for (const obj of this._objects.values()) {
      obj.resetPosition();
    }
  }

  /**
   * Clean up all objects
   */
  dispose() {
    for (const id of this._objects.keys()) {
      this.unregister(id);
    }
    this._objects.clear();
    this._isInitialized = false;
  }
}

/**
 * Singleton instance of HolographicObjectManager
 */
export const holographicObjectManager = new HolographicObjectManager();

// Expose safe global debug reference for browser console inspection
if (typeof window !== 'undefined' && !window.holographicObjectManager) {
  window.holographicObjectManager = holographicObjectManager;
}
