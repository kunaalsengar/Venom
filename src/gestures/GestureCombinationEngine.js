/**
 * PROJECT NEXUS — Advanced Gesture Combination Engine (Phase 3, Step 3.3)
 *
 * Evaluates composite, sequential, and dual-hand gesture patterns built on top of
 * primitive recognizers (Pinch, Swipe, and Individual Finger detection).
 *
 * Supported Built-in Combinations:
 * - Pinch + Hold: Continuous pinch held for a configured duration.
 * - Double Pinch: Discrete sequential double-pinch within a temporal window.
 * - Peace Sign + Hold: Index + Middle extended with Ring + Pinky curled, held over time.
 * - Pointing: Index extended while remaining digits are curled.
 * - Three-Finger: Index + Middle + Ring extended with Pinky curled.
 * - Two-Hand Pinch: Simultaneous dual-hand pinch engagement.
 *
 * Features:
 * - Simultaneous and sequential pattern arbitration.
 * - Independent per-hand combination tracking.
 * - Two-hand coordinated state tracking.
 * - Duplicate event filtering and cooldown enforcement.
 * - Zero heap allocations during high-frequency 60 FPS animation loops.
 *
 * @module gestures/GestureCombinationEngine
 */

import { AppConfig } from '../config/AppConfig.js';
import { stateManager } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';

export class GestureCombinationEngine {
  constructor() {
    this._cfg = AppConfig.combinations || {
      pinchHold: { holdDurationMs: 450, cooldownMs: 300 },
      doublePinch: { windowMs: 420, minIntervalMs: 80, cooldownMs: 350 },
      peaceSign: { holdDurationMs: 350, thumbTolerance: 'ANY', cooldownMs: 400 },
      pointing: { stabilityFrames: 2, thumbTolerance: 'ANY', cooldownMs: 250 },
      threeFinger: { stabilityFrames: 2, thumbTolerance: 'ANY', cooldownMs: 250 },
      twoHandPinch: { stabilityFrames: 2, cooldownMs: 400 }
    };

    // Per-hand independent combination tracking state
    this._handTrackers = {
      left: this._createHandTracker(),
      right: this._createHandTracker()
    };

    // Two-hand combination tracking state
    this._twoHandTracker = {
      activeCombination: null,
      bothHandsPinching: false,
      stabilityCount: 0,
      startedAt: 0,
      lastEndedAt: 0
    };

    // Pre-allocated return payload
    this._result = {
      left: {
        activeCombination: null,
        combinationStartedAt: 0,
        combinationDuration: 0,
        isPinchHolding: false,
        isPeaceSignHolding: false,
        isPointing: false,
        isThreeFinger: false
      },
      right: {
        activeCombination: null,
        combinationStartedAt: 0,
        combinationDuration: 0,
        isPinchHolding: false,
        isPeaceSignHolding: false,
        isPointing: false,
        isThreeFinger: false
      },
      twoHand: {
        activeCombination: null,
        bothHandsPinching: false,
        startedAt: 0,
        duration: 0
      },
      activeCombination: null
    };
  }

  _createHandTracker() {
    return {
      activeCombination: null,
      combinationStartedAt: 0,

      // Pinch + Hold tracker
      pinchHold: {
        isHolding: false,
        startedAt: 0,
        fired: false,
        lastEndedAt: 0
      },

      // Double Pinch tracker
      doublePinch: {
        firstPinchStart: 0,
        firstPinchEnd: 0,
        pendingSecond: false,
        lastFiredAt: 0,
        lastSeenPinchActive: false
      },

      // Peace Sign + Hold tracker
      peaceSign: {
        patternMatchedAt: 0,
        isHolding: false,
        stabilityCount: 0,
        fired: false,
        lastEndedAt: 0
      },

      // Pointing tracker
      pointing: {
        isPointing: false,
        stabilityCount: 0,
        startedAt: 0,
        lastEndedAt: 0
      },

      // Three-Finger tracker
      threeFinger: {
        isThreeFinger: false,
        stabilityCount: 0,
        startedAt: 0,
        lastEndedAt: 0
      }
    };
  }

  /**
   * Process combinations across left, right, and two-hand states.
   *
   * @param {Object} hands - Container of left and right hand states from LandmarkProcessor
   * @param {Object} gestureStatus - Output from GestureRecognizer.process
   * @param {number} currentTimeMs - Current timestamp in milliseconds
   * @returns {Object} Active combination status
   */
  process(hands, gestureStatus, currentTimeMs) {
    const cfg = this._cfg;
    const lossGraceMs = AppConfig.gestures?.transition?.handLossResetGraceMs || 200;

    // --- STEP 1: Process Left and Right Hands Independently ---
    for (const side of ['left', 'right']) {
      const handState = hands ? hands[side] : null;
      const tracker = this._handTrackers[side];
      const pinch = gestureStatus ? gestureStatus[side]?.pinch : null;
      const fingers = gestureStatus ? gestureStatus[side]?.fingers : null;

      if (handState && handState.detected) {
        this._processPinchHold(side, tracker, pinch, currentTimeMs, cfg.pinchHold);
        this._processDoublePinch(side, tracker, pinch, currentTimeMs, cfg.doublePinch);
        this._processPeaceSignHold(side, tracker, fingers, currentTimeMs, cfg.peaceSign);
        this._processPointing(side, tracker, fingers, currentTimeMs, cfg.pointing);
        this._processThreeFinger(side, tracker, fingers, currentTimeMs, cfg.threeFinger);

        // Resolve dominant single-hand active combination
        let activeComb = null;
        let startedAt = 0;
        if (tracker.pinchHold.isHolding) {
          activeComb = 'PINCH_HOLD';
          startedAt = tracker.pinchHold.startedAt;
        } else if (tracker.peaceSign.isHolding) {
          activeComb = 'PEACE_SIGN_HOLD';
          startedAt = tracker.peaceSign.patternMatchedAt;
        } else if (tracker.pointing.isPointing) {
          activeComb = 'POINTING';
          startedAt = tracker.pointing.startedAt;
        } else if (tracker.threeFinger.isThreeFinger) {
          activeComb = 'THREE_FINGER';
          startedAt = tracker.threeFinger.startedAt;
        }

        tracker.activeCombination = activeComb;
        tracker.combinationStartedAt = startedAt;

        // Synchronize with StateManager
        stateManager.updateHandCombinationState(side, {
          activeCombination: activeComb,
          combinationStartedAt: startedAt,
          combinationDuration: activeComb ? Math.max(0, currentTimeMs - startedAt) : 0,
          isPinchHolding: tracker.pinchHold.isHolding,
          isPeaceSignHolding: tracker.peaceSign.isHolding,
          isPointing: tracker.pointing.isPointing,
          isThreeFinger: tracker.threeFinger.isThreeFinger,
          doublePinchPending: tracker.doublePinch.pendingSecond
        });
      } else {
        // Hand is not detected
        const lastSeen = handState ? handState.lastSeenTimestamp : 0;
        if (currentTimeMs - lastSeen > lossGraceMs) {
          this._resetHandTracker(side, tracker, currentTimeMs);
        }
      }

      // Populate pre-allocated result
      const out = this._result[side];
      out.activeCombination = tracker.activeCombination;
      out.combinationStartedAt = tracker.combinationStartedAt;
      out.combinationDuration = tracker.activeCombination ? Math.max(0, currentTimeMs - tracker.combinationStartedAt) : 0;
      out.isPinchHolding = tracker.pinchHold.isHolding;
      out.isPeaceSignHolding = tracker.peaceSign.isHolding;
      out.isPointing = tracker.pointing.isPointing;
      out.isThreeFinger = tracker.threeFinger.isThreeFinger;
    }

    // --- STEP 2: Process Two-Hand Coordinated Combinations ---
    this._processTwoHandCombinations(hands, gestureStatus, currentTimeMs, cfg.twoHandPinch);

    // Populate overall primary / two-hand combination in result
    const twoHand = this._result.twoHand;
    twoHand.activeCombination = this._twoHandTracker.activeCombination;
    twoHand.bothHandsPinching = this._twoHandTracker.bothHandsPinching;
    twoHand.startedAt = this._twoHandTracker.startedAt;
    twoHand.duration = twoHand.activeCombination ? Math.max(0, currentTimeMs - this._twoHandTracker.startedAt) : 0;

    this._result.activeCombination = this._twoHandTracker.activeCombination ||
                                     this._result.right.activeCombination ||
                                     this._result.left.activeCombination || null;

    return this._result;
  }

  // ---------------------------------------------------------------------------
  // Single-Hand Combination Processors
  // ---------------------------------------------------------------------------

  /**
   * Process Pinch + Hold combination
   * @private
   */
  _processPinchHold(side, tracker, pinch, currentTimeMs, cfg) {
    const ph = tracker.pinchHold;
    const holdMs = cfg?.holdDurationMs || 450;
    const isPinching = pinch && pinch.active;

    if (isPinching) {
      if (!ph.startedAt) ph.startedAt = pinch.startedAt || currentTimeMs;
      const duration = currentTimeMs - ph.startedAt;

      if (duration >= holdMs && !ph.fired) {
        ph.fired = true;
        ph.isHolding = true;

        eventBus.emit(Events.PINCH_HOLD_START, {
          hand: side,
          duration,
          startedAt: ph.startedAt,
          timestamp: currentTimeMs
        });

        eventBus.emit(Events.GESTURE_COMBINATION_START, {
          hand: side,
          combination: 'PINCH_HOLD',
          duration,
          timestamp: currentTimeMs
        });
      }
    } else {
      if (ph.isHolding) {
        ph.isHolding = false;
        ph.lastEndedAt = currentTimeMs;

        eventBus.emit(Events.PINCH_HOLD_END, {
          hand: side,
          duration: currentTimeMs - ph.startedAt,
          timestamp: currentTimeMs
        });

        eventBus.emit(Events.GESTURE_COMBINATION_END, {
          hand: side,
          combination: 'PINCH_HOLD',
          timestamp: currentTimeMs
        });
      }
      ph.startedAt = 0;
      ph.fired = false;
    }
  }

  /**
   * Process Double Pinch sequential pattern
   * @private
   */
  _processDoublePinch(side, tracker, pinch, currentTimeMs, cfg) {
    const dp = tracker.doublePinch;
    const windowMs = cfg?.windowMs || 420;
    const minIntervalMs = cfg?.minIntervalMs || 80;
    const cooldownMs = cfg?.cooldownMs || 350;

    const isPinching = pinch && pinch.active;
    const wasPinching = dp.lastSeenPinchActive;
    dp.lastSeenPinchActive = isPinching;

    // Check cooldown
    if (currentTimeMs - dp.lastFiredAt < cooldownMs) {
      dp.pendingSecond = false;
      return;
    }

    // Pinch transitioned from active to inactive: record pinch 1 completion
    if (wasPinching && !isPinching) {
      if (!dp.pendingSecond) {
        dp.firstPinchStart = pinch?.startedAt || (currentTimeMs - 100);
        dp.firstPinchEnd = currentTimeMs;
        dp.pendingSecond = true;
      }
    }

    // Pinch transitioned from inactive to active: check if this is pinch 2
    if (!wasPinching && isPinching) {
      if (dp.pendingSecond) {
        const timeSinceFirstEnd = currentTimeMs - dp.firstPinchEnd;
        const totalInterval = currentTimeMs - dp.firstPinchStart;

        if (timeSinceFirstEnd >= minIntervalMs && totalInterval <= windowMs) {
          // Double pinch confirmed!
          dp.lastFiredAt = currentTimeMs;
          dp.pendingSecond = false;

          eventBus.emit(Events.DOUBLE_PINCH, {
            hand: side,
            intervalMs: totalInterval,
            timestamp: currentTimeMs
          });

          eventBus.emit(Events.GESTURE_COMBINATION_START, {
            hand: side,
            combination: 'DOUBLE_PINCH',
            intervalMs: totalInterval,
            timestamp: currentTimeMs
          });

          eventBus.emit(Events.GESTURE_COMBINATION_END, {
            hand: side,
            combination: 'DOUBLE_PINCH',
            timestamp: currentTimeMs
          });
        } else {
          // Exceeded window: treat as new first pinch
          dp.firstPinchStart = currentTimeMs;
          dp.pendingSecond = false;
        }
      }
    }

    // Expire pending window if no second pinch arrived
    if (dp.pendingSecond && (currentTimeMs - dp.firstPinchStart > windowMs)) {
      dp.pendingSecond = false;
    }
  }

  /**
   * Process Peace Sign + Hold combination (Index & Middle extended, Ring & Pinky curled)
   * @private
   */
  _processPeaceSignHold(side, tracker, fingers, currentTimeMs, cfg) {
    const ps = tracker.peaceSign;
    const holdMs = cfg?.holdDurationMs || 350;

    let isPeacePattern = false;
    if (fingers) {
      const idxExt = fingers.index?.state === 'EXTENDED';
      const midExt = fingers.middle?.state === 'EXTENDED';
      const rngCurl = fingers.ring?.state === 'CURLED';
      const pnkCurl = fingers.pinky?.state === 'CURLED';

      isPeacePattern = idxExt && midExt && rngCurl && pnkCurl;
    }

    if (isPeacePattern) {
      if (!ps.patternMatchedAt) ps.patternMatchedAt = currentTimeMs;
      const duration = currentTimeMs - ps.patternMatchedAt;

      if (duration >= holdMs && !ps.fired) {
        ps.fired = true;
        ps.isHolding = true;

        eventBus.emit(Events.PEACE_SIGN_HOLD, {
          hand: side,
          duration,
          timestamp: currentTimeMs
        });

        eventBus.emit(Events.GESTURE_COMBINATION_START, {
          hand: side,
          combination: 'PEACE_SIGN_HOLD',
          duration,
          timestamp: currentTimeMs
        });
      }
    } else {
      if (ps.isHolding) {
        ps.isHolding = false;
        ps.lastEndedAt = currentTimeMs;

        eventBus.emit(Events.GESTURE_COMBINATION_END, {
          hand: side,
          combination: 'PEACE_SIGN_HOLD',
          timestamp: currentTimeMs
        });
      }
      ps.patternMatchedAt = 0;
      ps.fired = false;
    }
  }

  /**
   * Process Pointing gesture (Index extended, remaining fingers curled)
   * @private
   */
  _processPointing(side, tracker, fingers, currentTimeMs, cfg) {
    const pt = tracker.pointing;
    const stabFrames = cfg?.stabilityFrames || 2;

    let isPointingPattern = false;
    if (fingers) {
      const idxExt = fingers.index?.state === 'EXTENDED';
      const midCurl = fingers.middle?.state === 'CURLED';
      const rngCurl = fingers.ring?.state === 'CURLED';
      const pnkCurl = fingers.pinky?.state === 'CURLED';

      isPointingPattern = idxExt && midCurl && rngCurl && pnkCurl;
    }

    if (isPointingPattern) {
      pt.stabilityCount++;
      if (pt.stabilityCount >= stabFrames && !pt.isPointing) {
        pt.isPointing = true;
        pt.startedAt = currentTimeMs;

        eventBus.emit(Events.POINTING, {
          hand: side,
          confidence: 1.0,
          timestamp: currentTimeMs
        });

        eventBus.emit(Events.GESTURE_COMBINATION_START, {
          hand: side,
          combination: 'POINTING',
          timestamp: currentTimeMs
        });
      }
    } else {
      if (pt.isPointing) {
        pt.isPointing = false;
        pt.lastEndedAt = currentTimeMs;

        eventBus.emit(Events.GESTURE_COMBINATION_END, {
          hand: side,
          combination: 'POINTING',
          timestamp: currentTimeMs
        });
      }
      pt.stabilityCount = 0;
    }
  }

  /**
   * Process Three-Finger gesture (Index, Middle, Ring extended, Pinky curled)
   * @private
   */
  _processThreeFinger(side, tracker, fingers, currentTimeMs, cfg) {
    const tf = tracker.threeFinger;
    const stabFrames = cfg?.stabilityFrames || 2;

    let isThreeFingerPattern = false;
    if (fingers) {
      const idxExt = fingers.index?.state === 'EXTENDED';
      const midExt = fingers.middle?.state === 'EXTENDED';
      const rngExt = fingers.ring?.state === 'EXTENDED';
      const pnkCurl = fingers.pinky?.state === 'CURLED';

      isThreeFingerPattern = idxExt && midExt && rngExt && pnkCurl;
    }

    if (isThreeFingerPattern) {
      tf.stabilityCount++;
      if (tf.stabilityCount >= stabFrames && !tf.isThreeFinger) {
        tf.isThreeFinger = true;
        tf.startedAt = currentTimeMs;

        eventBus.emit(Events.THREE_FINGER, {
          hand: side,
          confidence: 1.0,
          timestamp: currentTimeMs
        });

        eventBus.emit(Events.GESTURE_COMBINATION_START, {
          hand: side,
          combination: 'THREE_FINGER',
          timestamp: currentTimeMs
        });
      }
    } else {
      if (tf.isThreeFinger) {
        tf.isThreeFinger = false;
        tf.lastEndedAt = currentTimeMs;

        eventBus.emit(Events.GESTURE_COMBINATION_END, {
          hand: side,
          combination: 'THREE_FINGER',
          timestamp: currentTimeMs
        });
      }
      tf.stabilityCount = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Two-Hand Combination Processors
  // ---------------------------------------------------------------------------

  /**
   * Process Two-Hand Coordinated Pinch
   * @private
   */
  _processTwoHandCombinations(hands, gestureStatus, currentTimeMs, cfg) {
    const th = this._twoHandTracker;
    const stabFrames = cfg?.stabilityFrames || 2;

    const leftActive = Boolean(hands?.left?.detected && gestureStatus?.left?.pinch?.active);
    const rightActive = Boolean(hands?.right?.detected && gestureStatus?.right?.pinch?.active);
    const bothPinching = leftActive && rightActive;

    if (bothPinching) {
      th.stabilityCount++;
      if (th.stabilityCount >= stabFrames && !th.bothHandsPinching) {
        th.bothHandsPinching = true;
        th.startedAt = currentTimeMs;
        th.activeCombination = 'BOTH_HANDS_PINCH';

        const leftDist = gestureStatus?.left?.pinch?.distance || 0.1;
        const rightDist = gestureStatus?.right?.pinch?.distance || 0.1;

        eventBus.emit(Events.BOTH_HANDS_PINCH_START, {
          leftDistance: leftDist,
          rightDistance: rightDist,
          timestamp: currentTimeMs
        });

        eventBus.emit(Events.GESTURE_COMBINATION_START, {
          hand: 'both',
          combination: 'BOTH_HANDS_PINCH',
          timestamp: currentTimeMs
        });

        stateManager.updateTwoHandCombinationState({
          activeCombination: 'BOTH_HANDS_PINCH',
          bothHandsPinching: true,
          startedAt: currentTimeMs,
          duration: 0
        });
      }
    } else {
      if (th.bothHandsPinching) {
        th.bothHandsPinching = false;
        th.activeCombination = null;
        th.lastEndedAt = currentTimeMs;

        const releasedHand = !leftActive ? 'left' : 'right';

        eventBus.emit(Events.BOTH_HANDS_PINCH_END, {
          releasedHand,
          duration: currentTimeMs - th.startedAt,
          timestamp: currentTimeMs
        });

        eventBus.emit(Events.GESTURE_COMBINATION_END, {
          hand: 'both',
          combination: 'BOTH_HANDS_PINCH',
          timestamp: currentTimeMs
        });

        stateManager.updateTwoHandCombinationState({
          activeCombination: null,
          bothHandsPinching: false,
          startedAt: 0,
          duration: 0
        });
      }
      th.stabilityCount = 0;
    }
  }

  /**
   * Reset single-hand tracker on loss
   * @private
   */
  _resetHandTracker(side, tracker, currentTimeMs) {
    if (tracker.pinchHold.isHolding) {
      tracker.pinchHold.isHolding = false;
      eventBus.emit(Events.PINCH_HOLD_END, { hand: side, duration: 0, timestamp: currentTimeMs });
      eventBus.emit(Events.GESTURE_COMBINATION_END, { hand: side, combination: 'PINCH_HOLD', timestamp: currentTimeMs });
    }
    if (tracker.peaceSign.isHolding) {
      tracker.peaceSign.isHolding = false;
      eventBus.emit(Events.GESTURE_COMBINATION_END, { hand: side, combination: 'PEACE_SIGN_HOLD', timestamp: currentTimeMs });
    }
    if (tracker.pointing.isPointing) {
      tracker.pointing.isPointing = false;
      eventBus.emit(Events.GESTURE_COMBINATION_END, { hand: side, combination: 'POINTING', timestamp: currentTimeMs });
    }
    if (tracker.threeFinger.isThreeFinger) {
      tracker.threeFinger.isThreeFinger = false;
      eventBus.emit(Events.GESTURE_COMBINATION_END, { hand: side, combination: 'THREE_FINGER', timestamp: currentTimeMs });
    }

    tracker.activeCombination = null;
    tracker.combinationStartedAt = 0;
    tracker.pinchHold.startedAt = 0;
    tracker.pinchHold.fired = false;
    tracker.doublePinch.pendingSecond = false;
    tracker.peaceSign.patternMatchedAt = 0;
    tracker.peaceSign.fired = false;
    tracker.pointing.stabilityCount = 0;
    tracker.threeFinger.stabilityCount = 0;

    stateManager.updateHandCombinationState(side, {
      activeCombination: null,
      combinationStartedAt: 0,
      combinationDuration: 0,
      isPinchHolding: false,
      isPeaceSignHolding: false,
      isPointing: false,
      isThreeFinger: false,
      doublePinchPending: false
    });
  }

  /**
   * Reset all combinations
   */
  reset() {
    const now = performance.now();
    for (const side of ['left', 'right']) {
      this._resetHandTracker(side, this._handTrackers[side], now);
    }
    if (this._twoHandTracker.bothHandsPinching) {
      this._twoHandTracker.bothHandsPinching = false;
      this._twoHandTracker.activeCombination = null;
      eventBus.emit(Events.BOTH_HANDS_PINCH_END, { releasedHand: 'both', duration: 0, timestamp: now });
      eventBus.emit(Events.GESTURE_COMBINATION_END, { hand: 'both', combination: 'BOTH_HANDS_PINCH', timestamp: now });
      stateManager.updateTwoHandCombinationState({
        activeCombination: null,
        bothHandsPinching: false,
        startedAt: 0,
        duration: 0
      });
    }
  }

  /**
   * Get active combination for a specific hand side or 'twoHand'
   * @param {'left'|'right'|'twoHand'} side
   * @returns {Object}
   */
  getCombination(side) {
    if (side === 'twoHand') return this._result.twoHand;
    return this._result[side] || null;
  }
}

/**
 * Singleton instance of GestureCombinationEngine
 */
export const gestureCombinationEngine = new GestureCombinationEngine();

if (typeof window !== 'undefined' && !window.gestureCombinationEngine) {
  window.gestureCombinationEngine = gestureCombinationEngine;
}
