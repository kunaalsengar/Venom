/**
 * PROJECT NEXUS — Centralized StateManager
 * Manages application state categorized into 6 logical domains:
 * 1. Application State
 * 2. Camera State
 * 3. Hand Tracking State
 * 4. Gesture State
 * 5. Rendering State
 * 6. UI State
 *
 * Designed for zero-allocation 60 FPS property traversal in render loops,
 * paired with discrete event emission via EventBus for state transitions.
 *
 * @module core/StateManager
 */

import * as THREE from 'three';
import { AppConfig } from '../config/AppConfig.js';
import { Events, eventBus } from './EventBus.js';
import { createHandMetrics, copyMetrics } from '../utils/MathUtils.js';

export class StateManager {
  constructor() {
    // Pre-allocate 21 Vector3 instances to guarantee zero heap allocations in the 60 FPS loop
    const landmarks = Array.from({ length: 21 }, () => new THREE.Vector3(0, 0, 0));

    /**
     * Categorized State Hierarchy
     */
    this.state = {
      // 1. Application State
      app: {
        isInitialized: false,
        activeMode: 'hologram',
        fps: 60,
        dpr: 1,
        time: 0,
        dt: 0.016
      },

      // 2. Camera State
      camera: {
        isActive: false,
        hasStream: false,
        permissionGranted: false,
        width: AppConfig.tracking.videoIdealWidth,
        height: AppConfig.tracking.videoIdealHeight,
        facingMode: 'user',
        delegate: 'GPU' // 'GPU' | 'CPU' | 'NONE'
      },

      // 3. Hand Tracking State (Phase 2, Step 2.3 Dual-Hand Architecture)
      tracking: {
        handDetected: false,
        handsCount: 0,
        detectedHandsCount: 0,
        primaryHand: null,
        landmarks: landmarks,
        prevWrist: new THREE.Vector3(0, 0, 0),
        palmCenter: new THREE.Vector3(0, 0, 0),
        boundingRadius: 1.8,
        wristSpeed: 0.0,
        handSpeed: 0.0,
        hasVideoTexture: false,
        isMouseFallback: false,
        // Primary hand spatial & biomechanical metrics (Phase 2, Step 2.4)
        metrics: createHandMetrics(),
        hands: {
          left: {
            detected: false,
            handedness: 'Left',
            landmarks: Array.from({ length: 21 }, () => new THREE.Vector3(0, 0, 0)),
            rawLandmarks: null,
            worldLandmarks: null,
            prevWrist: new THREE.Vector3(0, 0, 0),
            palmCenter: new THREE.Vector3(0, 0, 0),
            boundingRadius: 1.8,
            wristSpeed: 0.0,
            handSpeed: 0.0,
            confidence: 0.0,
            lastSeenTimestamp: 0,
            gesture: 'IDLE',
            gestureConfidence: 0.0,
            gestureTimestamp: 0,
            metrics: createHandMetrics()
          },
          right: {
            detected: false,
            handedness: 'Right',
            landmarks: Array.from({ length: 21 }, () => new THREE.Vector3(0, 0, 0)),
            rawLandmarks: null,
            worldLandmarks: null,
            prevWrist: new THREE.Vector3(0, 0, 0),
            palmCenter: new THREE.Vector3(0, 0, 0),
            boundingRadius: 1.8,
            wristSpeed: 0.0,
            handSpeed: 0.0,
            confidence: 0.0,
            lastSeenTimestamp: 0,
            gesture: 'IDLE',
            gestureConfidence: 0.0,
            gestureTimestamp: 0,
            metrics: createHandMetrics()
          }
        }
      },

      // 4. Gesture State
      gestures: {
        currentGesture: 'IDLE',      // 'IDLE', 'OPEN', 'FIST', 'PINCH', 'SPREAD'
        pendingGesture: 'IDLE',
        gestureStableCount: 0,
        handSize: 0.8,
        pinchRatio: 1.0,
        pinchDistanceRatio: 1.0,
        lastEval: null,
        // Smooth morph weights (0.0 to 1.0)
        fistFactor: 0.0,
        openFactor: 0.0,
        pinchFactor: 0.0,
        spreadFactor: 0.0,
        // Independent Dual-Hand Gesture States (Phase 3, Step 3.1 & 3.2)
        hands: {
          left: {
            gesture: 'IDLE',
            confidence: 0.0,
            timestamp: 0,
            pinch: {
              active: false,
              distance: 1.0,
              confidence: 0.0,
              startedAt: 0,
              releasedAt: 0
            },
            swipe: {
              direction: null,      // 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | null
              velocity: 0.0,
              confidence: 0.0,
              timestamp: 0
            },
            fingers: {
              thumb: { state: 'NEUTRAL', confidence: 0.0, extended: false, curled: false },
              index: { state: 'NEUTRAL', confidence: 0.0, extended: false, curled: false },
              middle: { state: 'NEUTRAL', confidence: 0.0, extended: false, curled: false },
              ring: { state: 'NEUTRAL', confidence: 0.0, extended: false, curled: false },
              pinky: { state: 'NEUTRAL', confidence: 0.0, extended: false, curled: false }
            }
          },
          right: {
            gesture: 'IDLE',
            confidence: 0.0,
            timestamp: 0,
            pinch: {
              active: false,
              distance: 1.0,
              confidence: 0.0,
              startedAt: 0,
              releasedAt: 0
            },
            swipe: {
              direction: null,
              velocity: 0.0,
              confidence: 0.0,
              timestamp: 0
            },
            fingers: {
              thumb: { state: 'NEUTRAL', confidence: 0.0, extended: false, curled: false },
              index: { state: 'NEUTRAL', confidence: 0.0, extended: false, curled: false },
              middle: { state: 'NEUTRAL', confidence: 0.0, extended: false, curled: false },
              ring: { state: 'NEUTRAL', confidence: 0.0, extended: false, curled: false },
              pinky: { state: 'NEUTRAL', confidence: 0.0, extended: false, curled: false }
            }
          }
        },

        // Advanced Gesture Combinations (Phase 3, Step 3.3)
        combinations: {
          left: {
            activeCombination: null,     // string | null
            combinationStartedAt: 0,
            combinationDuration: 0,
            isPinchHolding: false,
            isPeaceSignHolding: false,
            isPointing: false,
            isThreeFinger: false,
            doublePinchPending: false
          },
          right: {
            activeCombination: null,
            combinationStartedAt: 0,
            combinationDuration: 0,
            isPinchHolding: false,
            isPeaceSignHolding: false,
            isPointing: false,
            isThreeFinger: false,
            doublePinchPending: false
          },
          twoHand: {
            activeCombination: null,     // 'BOTH_HANDS_PINCH' | null
            bothHandsPinching: false,
            startedAt: 0,
            duration: 0
          },
          activeCombination: null,
          combinationStartedAt: 0,
          combinationDuration: 0
        },

        // Custom Gesture Action Mapping (Phase 3, Step 3.3)
        mapping: {
          currentAction: null,           // string | null (e.g. 'SELECT', 'POINT')
          lastActionTimestamp: 0,
          activeMappingsCount: 0,
          mappings: {}
        }
      },

      // 5. Rendering State
      rendering: {
        resScale: AppConfig.rendering.initialResScale,
        maxRaymarchSteps: AppConfig.rendering.maxRaymarchSteps,
        particleCount: AppConfig.particles.count,
        bloomEnabled: true,
        antialias: false,
        // Holographic Interface State (Phase 4, Step 4.1)
        hologram: {
          visible: AppConfig.hologram.enabled,
          opacity: AppConfig.hologram.opacity,
          quality: 'high',
          activeComponents: ['grid', 'rings', 'core']
        },
        // GPU Particle Engine State (Phase 5, Steps 5.1, 5.2 & 5.3)
        particles: {
          visible: AppConfig.particles?.enabled !== false,
          count: AppConfig.particles?.count || 3000,
          quality: 'medium',
          mode: AppConfig.particles?.simulationMode || 'gpu',
          forceField: {
            mode: 'none',
            active: false,
            radius: AppConfig.particles?.forceField?.radius || 2.20,
            strength: 0.0
          },
          handInteraction: {
            enabled: AppConfig.particles?.handInteraction?.enabled !== false,
            left: {
              active: false,
              detected: false,
              mode: AppConfig.particles?.handInteraction?.left?.mode || AppConfig.particles?.handInteraction?.leftMode || 'repel',
              radius: AppConfig.particles?.handInteraction?.left?.radius || AppConfig.particles?.handInteraction?.radius || 2.20,
              strength: 0.0,
              position: { x: 0, y: 0, z: 0 }
            },
            right: {
              active: false,
              detected: false,
              mode: AppConfig.particles?.handInteraction?.right?.mode || AppConfig.particles?.handInteraction?.rightMode || 'attract',
              radius: AppConfig.particles?.handInteraction?.right?.radius || AppConfig.particles?.handInteraction?.radius || 2.20,
              strength: 0.0,
              position: { x: 0, y: 0, z: 0 }
            }
          }
        }
      },

      // 6. UI State
      ui: {
        hudVisible: true,
        mouseFallbackActive: false,
        activeCardIndex: 0,
        notificationText: '',
        notificationType: 'info'     // 'info' | 'warning' | 'error'
      },

      // 7. 3D Dual-Hand Interaction State (Phase 4, Step 4.2)
      interaction: {
        controllers: {
          left: {
            detected: false,
            visible: false,
            confidence: 0.0,
            position: new THREE.Vector3(0, 0, 0),
            palmCenter: new THREE.Vector3(0, 0, 0),
            indexTip: new THREE.Vector3(0, 0, 0),
            pinchPoint: new THREE.Vector3(0, 0, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            speed: 0.0,
            gesture: 'IDLE',
            isPinching: false,
            pinchDistance: 1.0,
            cursorOpacity: 0.0
          },
          right: {
            detected: false,
            visible: false,
            confidence: 0.0,
            position: new THREE.Vector3(0, 0, 0),
            palmCenter: new THREE.Vector3(0, 0, 0),
            indexTip: new THREE.Vector3(0, 0, 0),
            pinchPoint: new THREE.Vector3(0, 0, 0),
            velocity: new THREE.Vector3(0, 0, 0),
            speed: 0.0,
            gesture: 'IDLE',
            isPinching: false,
            pinchDistance: 1.0,
            cursorOpacity: 0.0
          }
        },
        twoHand: {
          available: false,
          distance: 0.0,
          midpoint: new THREE.Vector3(0, 0, 0),
          deltaX: 0.0,
          deltaY: 0.0,
          deltaZ: 0.0,
          spanRatio: 1.0,
          confidence: 0.0
        },
        hologramObjects: {
          hovered: {
            left: null,
            right: null
          },
          selected: {
            left: null,
            right: null
          },
          activeCount: 3,
          items: {}
        }
      }
    };

    // Convenience root-level alias properties mapped to domain sub-objects
    // Ensures 100% backward compatibility for legacy animation loops
    this._setupAliases();
  }

  /**
   * Setup backward-compatible accessors on state root
   * @private
   */
  _setupAliases() {
    const s = this.state;

    // Tracking aliases
    Object.defineProperty(s, 'isMouseFallback', {
      get: () => s.tracking.isMouseFallback,
      set: (v) => { s.tracking.isMouseFallback = v; }
    });
    Object.defineProperty(s, 'handDetected', {
      get: () => s.tracking.handDetected,
      set: (v) => { s.tracking.handDetected = v; }
    });
    Object.defineProperty(s, 'hands', {
      get: () => s.tracking.hands
    });
    Object.defineProperty(s.tracking.hands, 'detectedHandsCount', {
      get: () => s.tracking.detectedHandsCount,
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(s, 'detectedHandsCount', {
      get: () => s.tracking.detectedHandsCount
    });
    Object.defineProperty(s, 'landmarks', {
      get: () => s.tracking.landmarks
    });
    Object.defineProperty(s, 'prevWrist', {
      get: () => s.tracking.prevWrist
    });
    Object.defineProperty(s, 'palmCenter', {
      get: () => s.tracking.palmCenter
    });
    Object.defineProperty(s, 'boundingRadius', {
      get: () => s.tracking.boundingRadius,
      set: (v) => { s.tracking.boundingRadius = v; }
    });
    Object.defineProperty(s, 'wristSpeed', {
      get: () => s.tracking.wristSpeed,
      set: (v) => { s.tracking.wristSpeed = v; }
    });
    Object.defineProperty(s, 'handSpeed', {
      get: () => s.tracking.handSpeed,
      set: (v) => { s.tracking.handSpeed = v; }
    });
    Object.defineProperty(s, 'metrics', {
      get: () => s.tracking.metrics
    });
    Object.defineProperty(s, 'hasVideoTexture', {
      get: () => s.tracking.hasVideoTexture,
      set: (v) => { s.tracking.hasVideoTexture = v; }
    });

    // Gesture aliases
    Object.defineProperty(s, 'currentGesture', {
      get: () => s.gestures.currentGesture,
      set: (v) => { s.gestures.currentGesture = v; }
    });
    Object.defineProperty(s, 'pendingGesture', {
      get: () => s.gestures.pendingGesture,
      set: (v) => { s.gestures.pendingGesture = v; }
    });
    Object.defineProperty(s, 'gestureStableCount', {
      get: () => s.gestures.gestureStableCount,
      set: (v) => { s.gestures.gestureStableCount = v; }
    });
    Object.defineProperty(s, 'handSize', {
      get: () => s.gestures.handSize,
      set: (v) => { s.gestures.handSize = v; }
    });
    Object.defineProperty(s, 'pinchDistanceRatio', {
      get: () => s.gestures.pinchRatio,
      set: (v) => {
        s.gestures.pinchRatio = v;
        s.gestures.pinchDistanceRatio = v;
      }
    });
    Object.defineProperty(s, 'lastEval', {
      get: () => s.gestures.lastEval,
      set: (v) => { s.gestures.lastEval = v; }
    });
    Object.defineProperty(s, 'fistFactor', {
      get: () => s.gestures.fistFactor,
      set: (v) => { s.gestures.fistFactor = v; }
    });
    Object.defineProperty(s, 'openFactor', {
      get: () => s.gestures.openFactor,
      set: (v) => { s.gestures.openFactor = v; }
    });
    Object.defineProperty(s, 'pinchFactor', {
      get: () => s.gestures.pinchFactor,
      set: (v) => { s.gestures.pinchFactor = v; }
    });
    Object.defineProperty(s, 'spreadFactor', {
      get: () => s.gestures.spreadFactor,
      set: (v) => { s.gestures.spreadFactor = v; }
    });
    Object.defineProperty(s, 'handGestures', {
      get: () => s.gestures.hands
    });
    Object.defineProperty(s, 'combinations', {
      get: () => s.gestures.combinations
    });
    Object.defineProperty(s, 'mapping', {
      get: () => s.gestures.mapping
    });
    Object.defineProperty(s, 'currentAction', {
      get: () => s.gestures.mapping.currentAction,
      set: (v) => { s.gestures.mapping.currentAction = v; }
    });

    // Rendering alias
    Object.defineProperty(s, 'resScale', {
      get: () => s.rendering.resScale,
      set: (v) => { s.rendering.resScale = v; }
    });

    // Hologram alias (Phase 4, Step 4.1)
    Object.defineProperty(s, 'hologram', {
      get: () => s.rendering.hologram
    });

    // 3D Interaction aliases (Phase 4, Step 4.2 & 4.3)
    Object.defineProperty(s, 'controllers', {
      get: () => s.interaction.controllers
    });
    Object.defineProperty(s, 'twoHandMetrics', {
      get: () => s.interaction.twoHand
    });
    Object.defineProperty(s, 'hologramObjects', {
      get: () => s.interaction.hologramObjects
    });
  }

  /**
   * Set active experience mode and emit MODE_CHANGE
   * @param {string} modeId - e.g. 'hologram', 'particle', 'energy'
   */
  setMode(modeId) {
    if (this.state.app.activeMode === modeId) return;
    const prevMode = this.state.app.activeMode;
    this.state.app.activeMode = modeId;

    const modeConfig = AppConfig.ui.modes.find((m) => m.id === modeId);
    const modeName = modeConfig ? modeConfig.name : modeId.toUpperCase();

    eventBus.emit(Events.MODE_CHANGE, {
      previousMode: prevMode,
      activeMode: modeId,
      name: modeName
    });
  }

  /**
   * Update camera acquisition state and emit CAMERA_STATUS
   * @param {boolean} isActive
   * @param {string} [delegate='GPU']
   * @param {boolean} [hasStream=true]
   * @param {Object} [details={}]
   */
  setCameraState(isActive, delegate = 'GPU', hasStream = true, details = {}) {
    this.state.camera.isActive = isActive;
    this.state.camera.hasStream = hasStream;
    if (details.permissionGranted !== undefined) {
      this.state.camera.permissionGranted = details.permissionGranted;
    }
    if (details.facingMode) {
      this.state.camera.facingMode = details.facingMode;
    }
    if (details.width) this.state.camera.width = details.width;
    if (details.height) this.state.camera.height = details.height;
    if (delegate) this.state.camera.delegate = delegate;
    this.state.tracking.hasVideoTexture = isActive && hasStream;

    eventBus.emit(Events.CAMERA_STATUS, {
      isActive,
      delegate: this.state.camera.delegate,
      hasStream,
      ...details
    });
  }

  /**
   * Synchronize dual-hand tracking data and update primary hand backward compatibility aliases
   * @param {Object} payload
   * @param {Object} payload.hands - Both left and right hand tracking states
   * @param {number} payload.detectedHandsCount - Number of currently visible hands (0, 1, 2)
   * @param {string|null} payload.primaryHand - Currently arbitration-selected primary hand ('left'|'right'|null)
   */
  updateTwoHandTracking({ hands, detectedHandsCount, primaryHand }) {
    this.state.tracking.detectedHandsCount = detectedHandsCount;
    this.state.tracking.handsCount = detectedHandsCount;
    this.state.tracking.handDetected = detectedHandsCount > 0;
    this.state.tracking.primaryHand = primaryHand;

    // Sync left hand
    if (hands.left) {
      const srcL = hands.left;
      const dstL = this.state.tracking.hands.left;
      dstL.detected = srcL.detected;
      dstL.confidence = srcL.confidence;
      dstL.wristSpeed = srcL.wristSpeed;
      dstL.handSpeed = srcL.handSpeed;
      dstL.lastSeenTimestamp = srcL.lastSeenTimestamp;
      dstL.boundingRadius = srcL.boundingRadius;
      dstL.palmCenter.copy(srcL.palmCenter);
      for (let i = 0; i < 21; i++) {
        dstL.landmarks[i].copy(srcL.landmarks[i]);
      }
      if (srcL.metrics) {
        copyMetrics(srcL.metrics, dstL.metrics);
      }
      if (srcL.gesture !== undefined) {
        dstL.gesture = srcL.gesture;
        dstL.gestureConfidence = srcL.gestureConfidence || 0.0;
        dstL.gestureTimestamp = srcL.gestureTimestamp || 0;
      }
    }

    // Sync right hand
    if (hands.right) {
      const srcR = hands.right;
      const dstR = this.state.tracking.hands.right;
      dstR.detected = srcR.detected;
      dstR.confidence = srcR.confidence;
      dstR.wristSpeed = srcR.wristSpeed;
      dstR.handSpeed = srcR.handSpeed;
      dstR.lastSeenTimestamp = srcR.lastSeenTimestamp;
      dstR.boundingRadius = srcR.boundingRadius;
      dstR.palmCenter.copy(srcR.palmCenter);
      for (let i = 0; i < 21; i++) {
        dstR.landmarks[i].copy(srcR.landmarks[i]);
      }
      if (srcR.metrics) {
        copyMetrics(srcR.metrics, dstR.metrics);
      }
      if (srcR.gesture !== undefined) {
        dstR.gesture = srcR.gesture;
        dstR.gestureConfidence = srcR.gestureConfidence || 0.0;
        dstR.gestureTimestamp = srcR.gestureTimestamp || 0;
      }
    }

    // Synchronize primary hand to legacy single-hand state properties for zero-breakage backward compatibility
    if (primaryHand && hands[primaryHand] && hands[primaryHand].detected) {
      const p = hands[primaryHand];
      for (let i = 0; i < 21; i++) {
        this.state.tracking.landmarks[i].copy(p.landmarks[i]);
      }
      this.state.tracking.palmCenter.copy(p.palmCenter);
      this.state.tracking.boundingRadius = p.boundingRadius;
      this.state.tracking.wristSpeed = p.wristSpeed;
      this.state.tracking.handSpeed = p.handSpeed;
      this.state.tracking.prevWrist.copy(p.prevWrist);
      if (p.metrics) {
        copyMetrics(p.metrics, this.state.tracking.metrics);
      }
    } else if (detectedHandsCount === 0) {
      this.state.tracking.palmCenter.set(0, 0, 0);
      this.state.tracking.boundingRadius = 1.2;
      this.state.tracking.wristSpeed = 0.0;
      this.state.tracking.handSpeed = 0.0;
    }
  }

  /**
   * Switch between camera tracking and mouse fallback mode
   * @param {boolean} isFallback
   * @param {string} [reason='']
   */
  setMouseFallback(isFallback, reason = '') {
    this.state.tracking.isMouseFallback = isFallback;
    this.state.ui.mouseFallbackActive = isFallback;
    if (isFallback) {
      this.state.tracking.hasVideoTexture = false;
      this.state.camera.isActive = false;
    }

    eventBus.emit(Events.TRACKING_MODE_CHANGE, {
      isMouseFallback: isFallback,
      reason
    });
  }

  /**
   * Toggle HUD overlay visibility
   * @param {boolean} [force]
   * @returns {boolean} New visibility state
   */
  toggleHud(force) {
    const next = typeof force === 'boolean' ? force : !this.state.ui.hudVisible;
    this.state.ui.hudVisible = next;
    eventBus.emit(Events.HUD_TOGGLE, { visible: next });
    return next;
  }

  /**
   * Commit an independent hand gesture state update and emit GESTURE_DETECTED
   * @param {'left'|'right'} side
   * @param {string} gesture - 'IDLE'|'OPEN'|'FIST'|'PINCH'|'SPREAD'
   * @param {number} [confidence=1.0]
   * @param {number} [timestamp=performance.now()]
   */
  setHandGesture(side, gesture, confidence = 1.0, timestamp = performance.now()) {
    const handGestures = this.state.gestures.hands;
    if (!handGestures || !handGestures[side]) return;

    const prevGesture = handGestures[side].gesture;
    const hasChanged = prevGesture !== gesture;

    handGestures[side].gesture = gesture;
    handGestures[side].confidence = confidence;
    handGestures[side].timestamp = timestamp;

    const trackingHand = this.state.tracking.hands[side];
    if (trackingHand) {
      trackingHand.gesture = gesture;
      trackingHand.gestureConfidence = confidence;
      trackingHand.gestureTimestamp = timestamp;
    }

    // Synchronize to primary hand legacy state if this hand is current primary
    if (this.state.tracking.primaryHand === side) {
      this.setGesture(gesture);
    }

    if (hasChanged) {
      eventBus.emit(Events.GESTURE_DETECTED, {
        hand: side,
        gesture,
        previousGesture: prevGesture,
        confidence,
        timestamp
      });
    }
  }

  /**
   * Update independent pinch state for a hand
   * @param {'left'|'right'} side
   * @param {{ active: boolean, distance: number, confidence: number, startedAt: number, releasedAt: number }} data
   */
  updatePinchState(side, data) {
    const target = this.state.gestures.hands?.[side]?.pinch;
    if (!target) return;
    target.active = data.active;
    target.distance = data.distance;
    target.confidence = data.confidence;
    target.startedAt = data.startedAt;
    target.releasedAt = data.releasedAt;

    if (this.state.tracking.primaryHand === side) {
      this.state.gestures.pinchRatio = data.distance;
      this.state.gestures.pinchDistanceRatio = data.distance;
    }
  }

  /**
   * Update independent swipe state for a hand
   * @param {'left'|'right'} side
   * @param {{ direction: string|null, velocity: number, confidence: number, timestamp: number }} data
   */
  updateSwipeState(side, data) {
    const target = this.state.gestures.hands?.[side]?.swipe;
    if (!target) return;
    target.direction = data.direction;
    target.velocity = data.velocity;
    target.confidence = data.confidence;
    target.timestamp = data.timestamp;
  }

  /**
   * Update independent individual finger states for a hand
   * @param {'left'|'right'} side
   * @param {Object} data
   */
  updateFingerStates(side, data) {
    const target = this.state.gestures.hands?.[side]?.fingers;
    if (!target) return;
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
      if (data[f]) {
        target[f].state = data[f].state;
        target[f].confidence = data[f].confidence;
        target[f].extended = data[f].extended;
        target[f].curled = data[f].curled;
      }
    }
  }

  /**
   * Update combination state for a single hand (Phase 3, Step 3.3)
   * @param {'left'|'right'} side
   * @param {Object} data
   */
  updateHandCombinationState(side, data) {
    const target = this.state.gestures.combinations?.[side];
    if (!target) return;
    if (data.activeCombination !== undefined) target.activeCombination = data.activeCombination;
    if (data.combinationStartedAt !== undefined) target.combinationStartedAt = data.combinationStartedAt;
    if (data.combinationDuration !== undefined) target.combinationDuration = data.combinationDuration;
    if (data.isPinchHolding !== undefined) target.isPinchHolding = data.isPinchHolding;
    if (data.isPeaceSignHolding !== undefined) target.isPeaceSignHolding = data.isPeaceSignHolding;
    if (data.isPointing !== undefined) target.isPointing = data.isPointing;
    if (data.isThreeFinger !== undefined) target.isThreeFinger = data.isThreeFinger;
    if (data.doublePinchPending !== undefined) target.doublePinchPending = data.doublePinchPending;

    if (this.state.tracking.primaryHand === side) {
      this.state.gestures.combinations.activeCombination = target.activeCombination;
      this.state.gestures.combinations.combinationStartedAt = target.combinationStartedAt;
      this.state.gestures.combinations.combinationDuration = target.combinationDuration;
    }
  }

  /**
   * Update two-hand combination state (Phase 3, Step 3.3)
   * @param {Object} data
   */
  updateTwoHandCombinationState(data) {
    const target = this.state.gestures.combinations?.twoHand;
    if (!target) return;
    if (data.activeCombination !== undefined) {
      target.activeCombination = data.activeCombination;
      if (data.activeCombination) {
        this.state.gestures.combinations.activeCombination = data.activeCombination;
      }
    }
    if (data.bothHandsPinching !== undefined) target.bothHandsPinching = data.bothHandsPinching;
    if (data.startedAt !== undefined) target.startedAt = data.startedAt;
    if (data.duration !== undefined) target.duration = data.duration;
  }

  /**
   * Set the current semantic action triggered by gesture mapping (Phase 3, Step 3.3)
   * @param {string|null} action
   * @param {Object} [details={}]
   */
  setSemanticAction(action, details = {}) {
    const m = this.state.gestures.mapping;
    m.currentAction = action;
    m.lastActionTimestamp = details.timestamp || performance.now();
  }

  /**
   * Commit a gesture transition and emit GESTURE_CHANGE
   * @param {string} newGesture
   */
  setGesture(newGesture) {
    if (this.state.gestures.currentGesture === newGesture) return;
    const oldGesture = this.state.gestures.currentGesture;
    this.state.gestures.currentGesture = newGesture;

    eventBus.emit(Events.GESTURE_CHANGE, {
      previousGesture: oldGesture,
      currentGesture: newGesture
    });
  }

  /**
   * Update dynamic resolution scaling factor and emit RES_SCALE_CHANGE
   * @param {number} scale
   */
  setResScale(scale) {
    if (Math.abs(this.state.rendering.resScale - scale) < 0.001) return;
    this.state.rendering.resScale = scale;
    eventBus.emit(Events.RES_SCALE_CHANGE, { resScale: scale });
  }

  /**
   * Set holographic interface visibility and emit HOLOGRAM_VISIBILITY
   * @param {boolean} visible
   */
  setHologramVisibility(visible) {
    const isVis = Boolean(visible);
    if (this.state.rendering.hologram.visible === isVis) return;
    this.state.rendering.hologram.visible = isVis;
    eventBus.emit(Events.HOLOGRAM_VISIBILITY, { visible: isVis });
  }

  /**
   * Set holographic interface opacity and emit HOLOGRAM_OPACITY
   * @param {number} opacity - 0.0 to 1.0
   */
  setHologramOpacity(opacity) {
    const clamped = THREE.MathUtils.clamp(opacity, 0.0, 1.0);
    if (Math.abs(this.state.rendering.hologram.opacity - clamped) < 0.005) return;
    this.state.rendering.hologram.opacity = clamped;
    eventBus.emit(Events.HOLOGRAM_OPACITY, { opacity: clamped });
  }

  /**
   * Set holographic interface quality level and emit HOLOGRAM_QUALITY
   * @param {'low'|'medium'|'high'} quality
   */
  setHologramQuality(quality) {
    if (this.state.rendering.hologram.quality === quality) return;
    this.state.rendering.hologram.quality = quality;
    eventBus.emit(Events.HOLOGRAM_QUALITY, { quality });
  }

  /**
   * Set particle system visibility and emit PARTICLE_VISIBILITY (Phase 5, Step 5.1)
   * @param {boolean} visible
   */
  setParticleVisibility(visible) {
    const isVis = Boolean(visible);
    if (this.state.rendering.particles.visible === isVis) return;
    this.state.rendering.particles.visible = isVis;
    eventBus.emit(Events.PARTICLE_VISIBILITY, { visible: isVis });
  }

  /**
   * Set particle count and emit PARTICLE_COUNT (Phase 5, Step 5.1)
   * @param {number} count
   */
  setParticleCount(count) {
    const safeCount = Math.max(10, Math.round(count));
    if (this.state.rendering.particles.count === safeCount) return;
    this.state.rendering.particles.count = safeCount;
    this.state.rendering.particleCount = safeCount;
    eventBus.emit(Events.PARTICLE_COUNT, { count: safeCount });
  }

  /**
   * Set particle quality level and emit PARTICLE_QUALITY (Phase 5, Step 5.1)
   * @param {'low'|'medium'|'high'|'ultra'} quality
   */
  setParticleQuality(quality) {
    if (this.state.rendering.particles.quality === quality) return;
    this.state.rendering.particles.quality = quality;
    eventBus.emit(Events.PARTICLE_QUALITY, { quality });
  }

  /**
   * Update 3D interaction controller state for a specific hand (Phase 4, Step 4.2)
   * @param {'left'|'right'} side
   * @param {Object} data
   */
  updateInteractionController(side, data) {
    const ctrl = this.state.interaction.controllers[side];
    if (!ctrl || !data) return;

    if (data.detected !== undefined) ctrl.detected = data.detected;
    if (data.visible !== undefined) ctrl.visible = data.visible;
    if (data.confidence !== undefined) ctrl.confidence = data.confidence;
    if (data.position) ctrl.position.copy(data.position);
    if (data.palmCenter) ctrl.palmCenter.copy(data.palmCenter);
    if (data.indexTip) ctrl.indexTip.copy(data.indexTip);
    if (data.pinchPoint) ctrl.pinchPoint.copy(data.pinchPoint);
    if (data.velocity) ctrl.velocity.copy(data.velocity);
    if (data.speed !== undefined) ctrl.speed = data.speed;
    if (data.gesture !== undefined) ctrl.gesture = data.gesture;
    if (data.isPinching !== undefined) ctrl.isPinching = data.isPinching;
    if (data.pinchDistance !== undefined) ctrl.pinchDistance = data.pinchDistance;
    if (data.cursorOpacity !== undefined) ctrl.cursorOpacity = data.cursorOpacity;
  }

  /**
   * Update dual-hand spatial metrics (Phase 4, Step 4.2)
   * @param {Object} metrics
   */
  updateTwoHandMetrics(metrics) {
    const th = this.state.interaction.twoHand;
    if (!th || !metrics) return;

    th.available = Boolean(metrics.available);
    th.distance = metrics.distance || 0.0;
    if (metrics.midpoint) th.midpoint.copy(metrics.midpoint);
    th.deltaX = metrics.deltaX || 0.0;
    th.deltaY = metrics.deltaY || 0.0;
    th.deltaZ = metrics.deltaZ || 0.0;
    th.spanRatio = metrics.spanRatio || 1.0;
    th.confidence = metrics.confidence || 0.0;
  }

  /**
   * Update holographic object hover state (Phase 4, Step 4.3)
   * @param {'left'|'right'} side
   * @param {string|null} objectId
   */
  setHologramObjectHover(side, objectId) {
    const ho = this.state.interaction.hologramObjects;
    if (ho && ho.hovered && ho.hovered[side] !== objectId) {
      ho.hovered[side] = objectId;
    }
  }

  /**
   * Update holographic object selected state (Phase 4, Step 4.3)
   * @param {'left'|'right'} side
   * @param {string|null} objectId
   */
  setHologramObjectSelected(side, objectId) {
    const ho = this.state.interaction.hologramObjects;
    if (ho && ho.selected && ho.selected[side] !== objectId) {
      ho.selected[side] = objectId;
    }
  }

  /**
   * Update holographic object summary item (Phase 4, Step 4.3)
   * @param {string} objectId
   * @param {Object} itemData
   */
  updateHologramObjectItem(objectId, itemData) {
    const ho = this.state.interaction.hologramObjects;
    if (!ho) return;
    if (!ho.items[objectId]) {
      ho.items[objectId] = { id: objectId, state: 'IDLE', hoveringHand: null, selectingHand: null };
    }
    Object.assign(ho.items[objectId], itemData);
  }

  /**
   * Update particle hand interaction state (Phase 5, Step 5.3)
   * @param {'left'|'right'} side
   * @param {Object} data
   */
  updateParticleHand(side, data = {}) {
    const pHand = this.state.rendering?.particles?.handInteraction?.[side];
    if (!pHand) return;
    if (data.active !== undefined) pHand.active = data.active;
    if (data.detected !== undefined) pHand.detected = data.detected;
    if (data.mode !== undefined) pHand.mode = data.mode;
    if (data.radius !== undefined) pHand.radius = data.radius;
    if (data.strength !== undefined) pHand.strength = data.strength;
    if (data.position !== undefined) {
      if (!pHand.position) pHand.position = { x: 0, y: 0, z: 0 };
      pHand.position.x = data.position.x ?? 0;
      pHand.position.y = data.position.y ?? 0;
      pHand.position.z = data.position.z ?? 0;
    }
  }

  /**
   * Post a notification to the UI and emit NOTIFICATION
   * @param {string} message
   * @param {'info'|'warning'|'error'} [type='info']
   */
  notify(message, type = 'info') {
    this.state.ui.notificationText = message;
    this.state.ui.notificationType = type;
    eventBus.emit(Events.NOTIFICATION, { message, type });
  }
}

/**
 * Singleton instance of StateManager
 */
export const stateManager = new StateManager();

// Expose safe global debug reference for browser console inspection
if (typeof window !== 'undefined' && !window.stateManager) {
  window.stateManager = stateManager;
}
