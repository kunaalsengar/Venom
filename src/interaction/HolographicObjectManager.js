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
import { dist3, clamp, expDecayAlpha } from '../utils/MathUtils.js';

// Preallocated scratch vectors for zero-allocation 3D spatial transformations
const _scratchMidpoint = new THREE.Vector3();
const _scratchTargetPos = new THREE.Vector3();

export class HolographicObjectManager {
  constructor() {
    this._cfg = AppConfig.interaction.objects;
    this._manipCfg = AppConfig.interaction?.manipulation?.twoHand;
    this._twoHandCfg = AppConfig.interaction?.twoHand;

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

    // Preallocated two-hand manipulation session state (zero heap allocations in 60 FPS loop)
    this._twoHandSession = {
      active: false,
      objectId: null,
      baselineDistance: 0.0,
      baselineScale: 1.0,
      baselineAngleRad: 0.0,
      baselineRotationZ: 0.0,
      baselineMidpoint: new THREE.Vector3(0, 0, 0),
      baselineObjPosition: new THREE.Vector3(0, 0, 0),
      isTrackingValid: false,
      trackingLostTimestamp: 0,
      pinchReleaseFrames: 0
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
   * Active two-hand manipulation session state accessor
   * @returns {typeof this._twoHandSession}
   */
  get twoHandSession() {
    return this._twoHandSession;
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

    // 1. Process two-hand manipulation and independent hand interactions
    if (controllers) {
      this._updateTwoHandManipulation(controllers, dt, currentTimeMs);
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
   * Evaluate two-hand distance-based zoom and planar rotation on selected interactable holographic object
   * @private
   * @param {{ left: import('./HandController.js').HandController, right: import('./HandController.js').HandController }} controllers
   * @param {number} dt
   * @param {number} currentTimeMs
   */
  _updateTwoHandManipulation(controllers, dt, currentTimeMs) {
    if (!this._manipCfg || !this._manipCfg.enabled) {
      if (this._twoHandSession.active) {
        this._endTwoHandSession();
      }
      return;
    }

    const leftCtrl = controllers?.left;
    const rightCtrl = controllers?.right;

    const leftDetected = Boolean(leftCtrl && leftCtrl.detected);
    const rightDetected = Boolean(rightCtrl && rightCtrl.detected);
    const bothDetected = leftDetected && rightDetected;

    const leftPinching = Boolean(leftCtrl && leftCtrl.isPinching);
    const rightPinching = Boolean(rightCtrl && rightCtrl.isPinching);
    const bothPinching = bothDetected && leftPinching && rightPinching;

    // 1. If session is already active, manage continuity, tracking-loss, reacquisition, zoom, rotation, and translation
    if (this._twoHandSession.active) {
      const targetObj = this._objects.get(this._twoHandSession.objectId);

      // Verify the object still exists and at least one hand holds selection ownership
      const hasSelection = Boolean(this._handState.left.selectedId || this._handState.right.selectedId);
      if (!targetObj || !hasSelection) {
        this._endTwoHandSession();
        return;
      }

      // Handle Tracking Loss with Grace Window:
      // If either hand momentarily loses tracking, enter or continue grace period
      const trackingGraceMs = (this._manipCfg && this._manipCfg.trackingLossGraceMs) || 150;

      if (!bothDetected) {
        // Record timestamp on the first frame tracking was interrupted
        if (this._twoHandSession.isTrackingValid) {
          this._twoHandSession.isTrackingValid = false;
          this._twoHandSession.trackingLostTimestamp = currentTimeMs;
        }

        const timeLost = currentTimeMs - this._twoHandSession.trackingLostTimestamp;
        if (timeLost > trackingGraceMs) {
          // Tracking remained unavailable beyond grace window -> conclude session safely
          this._endTwoHandSession();
          return;
        }

        // During grace window: session stays active, object ownership retained,
        // all transforms frozen (translation, rotation, zoom do not update).
        // Baselines are NOT modified while tracking remains invalid.
        return;
      }

      // Evaluate Pinch State with Temporal Release Debouncing:
      // Prevent transient single-frame pinch-distance fluctuation from ending the session
      const debounceFrames = (this._manipCfg && this._manipCfg.pinchReleaseDebounceFrames) || 2;

      if (!bothPinching) {
        this._twoHandSession.pinchReleaseFrames++;

        if (this._twoHandSession.pinchReleaseFrames < debounceFrames) {
          // Transient pinch release flutter during grace window:
          // Hold session active, freeze transforms, do not terminate yet.
          return;
        }

        // Confirmed intentional release (persisted for >= debounceFrames)
        // Check if one hand is still pinching for clean single-hand handoff
        if (leftPinching && !rightPinching) {
          this._handoffToSingleHand('left', targetObj, leftCtrl);
        } else if (rightPinching && !leftPinching) {
          this._handoffToSingleHand('right', targetObj, rightCtrl);
        } else {
          this._endTwoHandSession();
        }
        return;
      }

      // Both hands detected and actively pinching: reset release debounce counter
      this._twoHandSession.pinchReleaseFrames = 0;

      const minSpan = (this._twoHandCfg && this._twoHandCfg.minSpanDistance) || 0.08;
      const currentDist = Math.max(minSpan, dist3(leftCtrl.position, rightCtrl.position));
      const deltaX = rightCtrl.position.x - leftCtrl.position.x;
      const deltaY = rightCtrl.position.y - leftCtrl.position.y;
      const currentAngleRad = Math.atan2(deltaY, deltaX);

      _scratchMidpoint.set(
        (leftCtrl.position.x + rightCtrl.position.x) * 0.5,
        (leftCtrl.position.y + rightCtrl.position.y) * 0.5,
        (leftCtrl.position.z + rightCtrl.position.z) * 0.5
      );

      // Handle Safe Reacquisition: On the first valid frame after tracking interruption,
      // re-anchor all baselines exactly once to prevent sudden jumps
      if (!this._twoHandSession.isTrackingValid) {
        this._twoHandSession.baselineDistance = currentDist;
        this._twoHandSession.baselineScale = targetObj.userScale;
        this._twoHandSession.baselineAngleRad = currentAngleRad;
        this._twoHandSession.baselineRotationZ = targetObj.userRotation.z;
        this._twoHandSession.baselineMidpoint.copy(_scratchMidpoint);
        this._twoHandSession.baselineObjPosition.copy(targetObj.position);
        this._twoHandSession.isTrackingValid = true;
        this._twoHandSession.trackingLostTimestamp = 0;
        return;
      }

      // A. Continuous Distance-Based Zoom with Baseline-Relative Deadband Filtering
      if (this._manipCfg.zoomEnabled !== false) {
        const d0 = this._twoHandSession.baselineDistance;
        const s0 = this._twoHandSession.baselineScale;
        if (d0 > 0.0001) {
          const deltaD = currentDist - d0;
          const deadband = (this._manipCfg && this._manipCfg.zoomDeadband) || 0.035;
          const threshold = d0 * deadband;

          let effectiveDelta = 0.0;
          if (Math.abs(deltaD) > threshold) {
            effectiveDelta = deltaD - Math.sign(deltaD) * threshold;
          }

          const sensitivity = (this._manipCfg && this._manipCfg.zoomSensitivity) || 1.20;
          const minScale = (this._manipCfg && this._manipCfg.minScale) || 0.40;
          const maxScale = (this._manipCfg && this._manipCfg.maxScale) || 2.80;

          const scaleRatio = 1.0 + (effectiveDelta / d0) * sensitivity;
          const targetScale = clamp(s0 * scaleRatio, minScale, maxScale);

          // Apply target user scale (InteractableHologram.update will exponentially smooth userScale)
          targetObj.setUserScale(targetScale);
        }
      }

      // B. Continuous Two-Hand Rotation with Branch-Cut Wrap Handling & Deadband Filtering
      if (this._manipCfg.rotationEnabled !== false) {
        const theta0 = this._twoHandSession.baselineAngleRad;
        const R0z = this._twoHandSession.baselineRotationZ;

        // Angular difference relative to baseline in camera-facing coronal XY plane
        let deltaTheta = currentAngleRad - theta0;

        // Normalize across [-PI, +PI] boundary to prevent sudden 360-degree flip
        if (deltaTheta > Math.PI) {
          deltaTheta -= 2.0 * Math.PI;
        } else if (deltaTheta < -Math.PI) {
          deltaTheta += 2.0 * Math.PI;
        }

        // Apply deadband in radians to eliminate micro-tremor around baseline
        const deadbandDeg = (this._manipCfg && this._manipCfg.rotationDeadbandDeg) || 3.0;
        const deadbandRad = deadbandDeg * (Math.PI / 180.0);

        let effectiveDeltaTheta = 0.0;
        if (Math.abs(deltaTheta) > deadbandRad) {
          effectiveDeltaTheta = deltaTheta - Math.sign(deltaTheta) * deadbandRad;
        }

        const rotSensitivity = (this._manipCfg && this._manipCfg.rotationSensitivity) || 1.10;
        const targetRotZ = R0z + effectiveDeltaTheta * rotSensitivity;

        // Apply target user rotation (InteractableHologram.update will exponentially smooth userRotation)
        targetObj.setUserRotation(targetObj.targetUserRotation.x, targetObj.targetUserRotation.y, targetRotZ);
      }

      // C. Coordinated Two-Hand 3D Translation via Midpoint Displacement
      _scratchTargetPos.copy(this._twoHandSession.baselineObjPosition)
        .add(_scratchMidpoint)
        .sub(this._twoHandSession.baselineMidpoint);

      const dragSmoothing = (this._manipCfg && this._manipCfg.twoHandDragSmoothing) || 24.0;
      const transAlpha = expDecayAlpha(dragSmoothing, dt);
      targetObj.position.lerp(_scratchTargetPos, transAlpha);
      targetObj.targetPosition.copy(_scratchTargetPos);

      // Continuously synchronize selecting controller's drag offset to prevent snap on single-hand handoff
      if (targetObj.selectingHand && controllers[targetObj.selectingHand]) {
        targetObj.dragOffset.copy(targetObj.position).sub(controllers[targetObj.selectingHand].position);
      }

      return;
    }

    // 2. Evaluate Two-Hand Engagement Conditions for a new session
    if (!bothPinching) return;

    const leftSel = this._handState.left.selectedId;
    const rightSel = this._handState.right.selectedId;

    // Reject engagement if there is a conflict (each hand holds a DIFFERENT object)
    if (leftSel && rightSel && leftSel !== rightSel) {
      return;
    }

    const targetId = leftSel || rightSel;
    if (!targetId) return;

    const targetObj = this._objects.get(targetId);
    if (!targetObj) return;

    // Latch baseline parameters at engagement moment
    const minSpan = (this._twoHandCfg && this._twoHandCfg.minSpanDistance) || 0.08;
    const currentDist = Math.max(minSpan, dist3(leftCtrl.position, rightCtrl.position));
    const deltaX = rightCtrl.position.x - leftCtrl.position.x;
    const deltaY = rightCtrl.position.y - leftCtrl.position.y;
    const currentAngleRad = Math.atan2(deltaY, deltaX);

    _scratchMidpoint.set(
      (leftCtrl.position.x + rightCtrl.position.x) * 0.5,
      (leftCtrl.position.y + rightCtrl.position.y) * 0.5,
      (leftCtrl.position.z + rightCtrl.position.z) * 0.5
    );

    this._twoHandSession.active = true;
    this._twoHandSession.objectId = targetId;
    this._twoHandSession.baselineDistance = currentDist;
    this._twoHandSession.baselineScale = targetObj.userScale;
    this._twoHandSession.baselineAngleRad = currentAngleRad;
    this._twoHandSession.baselineRotationZ = targetObj.userRotation.z;
    this._twoHandSession.baselineMidpoint.copy(_scratchMidpoint);
    this._twoHandSession.baselineObjPosition.copy(targetObj.position);
    this._twoHandSession.isTrackingValid = true;
    this._twoHandSession.trackingLostTimestamp = 0;
    this._twoHandSession.pinchReleaseFrames = 0;
  }

  /**
   * Alias for backward compatibility
   * @private
   */
  _updateTwoHandZoom(controllers, dt, currentTimeMs) {
    this._updateTwoHandManipulation(controllers, dt, currentTimeMs);
  }

  /**
   * Seamlessly hand off an object from a two-hand session to a single continuing pinching hand
   * @private
   * @param {'left'|'right'} hand
   * @param {InteractableHologram} targetObj
   * @param {import('./HandController.js').HandController} controller
   */
  _handoffToSingleHand(hand, targetObj, controller) {
    const otherHand = hand === 'left' ? 'right' : 'left';

    // Clear selection on releasing hand if it held it
    if (this._handState[otherHand].selectedId === targetObj.id) {
      this._handState[otherHand].selectedId = null;
      stateManager.setHologramObjectSelected(otherHand, null);
    }

    // Ensure continuing hand owns selection
    this._handState[hand].selectedId = targetObj.id;
    stateManager.setHologramObjectSelected(hand, targetObj.id);
    targetObj.setSelected(true, hand, controller ? controller.position : null);

    if (controller) {
      targetObj.dragOffset.copy(targetObj.position).sub(controller.position);
    }

    this._endTwoHandSession();
  }

  /**
   * Terminate active two-hand manipulation session
   * @private
   */
  _endTwoHandSession() {
    this._twoHandSession.active = false;
    this._twoHandSession.objectId = null;
    this._twoHandSession.baselineDistance = 0.0;
    this._twoHandSession.baselineScale = 1.0;
    this._twoHandSession.baselineAngleRad = 0.0;
    this._twoHandSession.baselineRotationZ = 0.0;
    this._twoHandSession.baselineMidpoint.set(0, 0, 0);
    this._twoHandSession.baselineObjPosition.set(0, 0, 0);
    this._twoHandSession.isTrackingValid = false;
    this._twoHandSession.trackingLostTimestamp = 0;
    this._twoHandSession.pinchReleaseFrames = 0;
  }

  /**
   * Check whether an active two-hand manipulation session owns the given object.
   * Exclusive ownership depends strictly on session.active and matching objectId,
   * guaranteeing that single-hand dragging is suppressed even during temporary tracking loss.
   *
   * @private
   * @param {string} objectId
   * @returns {boolean}
   */
  _isTwoHandManipulatingObject(objectId) {
    return Boolean(
      this._twoHandSession.active &&
      this._twoHandSession.objectId === objectId
    );
  }

  /**
   * Check whether an active two-hand zoom session owns the given object (alias for backward compatibility)
   * @private
   * @param {string} objectId
   * @returns {boolean}
   */
  _isTwoHandZoomActiveFor(objectId) {
    return this._isTwoHandManipulatingObject(objectId);
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
      // If hand lost tracking, cleanly release any held selection & clear hover,
      // unless an active two-hand session is currently active on this object (in which case manipulation pauses)
      const isTwoHandLocked = this._isTwoHandManipulatingObject(hState.selectedId);
      if (hState.selectedId && !isTwoHandLocked) {
        this._releaseSelection(side, hState.selectedId);
      }
      if (hState.hoveredId && !isTwoHandLocked) {
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
          // Suppress single-hand drag translation if active two-hand manipulation owns this object
          if (!this._isTwoHandManipulatingObject(hState.selectedId)) {
            selectedObj.dragTo(cPos, dt);
          }
        } else {
          // Pinch ended -> if active two-hand session owns this object, do not release selection here;
          // two-hand session manages pinch-release debouncing and handoff centrally.
          if (!this._isTwoHandManipulatingObject(hState.selectedId)) {
            this._releaseSelection(side, hState.selectedId);
          }
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
    } else if (this._twoHandSession.active && this._twoHandSession.objectId) {
      // While participating in active two-hand manipulation, lock focus to the manipulated object
      closestObj = this._objects.get(this._twoHandSession.objectId);
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
      if (pinchStarted && !hState.selectedId && !this._twoHandSession.active) {
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
      // Only evaluate when NOT pinching and NOT in two-hand manipulation session
      if (!this._twoHandSession.active && !isPinching && (gesture === 'FIST' || gesture === 'SPREAD') &&
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

    // If this object was engaged in two-hand manipulation, end session cleanly
    if (this._twoHandSession.active && this._twoHandSession.objectId === objectId) {
      this._endTwoHandSession();
    }
  }

  /**
   * Reset all interactable objects to their default positions
   */
  resetAllPositions() {
    this._endTwoHandSession();
    for (const obj of this._objects.values()) {
      obj.resetPosition();
    }
  }

  /**
   * Clean up all objects
   */
  dispose() {
    this._endTwoHandSession();
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
