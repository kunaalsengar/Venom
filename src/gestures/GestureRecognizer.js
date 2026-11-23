/**
 * PROJECT NEXUS — Open Palm & Fist Recognition Engine (Phase 3, Step 3.1)
 *
 * Dedicated modular gesture recognition engine providing independent classification
 * for both left and right hands using MediaPipe 3D landmarks and Phase 2 biomechanical metrics.
 *
 * Features:
 * - Anatomically grounded Open Palm and Fist classification.
 * - Independent dual-hand gesture tracking with non-interfering states.
 * - Temporal stability filtering and hysteresis (prevents frame-to-frame flickering).
 * - Ambiguous pose filtering (neutral IDLE state for transitional poses).
 * - Backward compatibility with legacy Pinch and Spread gesture interactions.
 * - Zero heap allocations during the 60 FPS animation loop.
 *
 * @module gestures/GestureRecognizer
 */

import { AppConfig } from '../config/AppConfig.js';
import { stateManager } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { dist3 } from '../utils/MathUtils.js';
import { pinchDetector } from './PinchDetector.js';
import { swipeDetector } from './SwipeDetector.js';
import { fingerDetector } from './FingerDetector.js';
import { gestureCombinationEngine } from './GestureCombinationEngine.js';
import { gestureMapper } from './GestureMapper.js';

export class GestureRecognizer {
  constructor() {
    this._cfg = AppConfig.gestures;

    // Sub-detector instances
    this.pinchDetector = pinchDetector;
    this.swipeDetector = swipeDetector;
    this.fingerDetector = fingerDetector;
    this.combinationEngine = gestureCombinationEngine;
    this.mapper = gestureMapper;

    // Per-hand temporal stability tracking states
    this._trackers = {
      left: {
        currentGesture: 'IDLE',
        pendingGesture: 'IDLE',
        stableCount: 0,
        firstSeenTime: 0,
        lastUpdatedTime: 0,
        confidence: 0.0,
        candidateGesture: 'IDLE',
        candidateConfidence: 0.0,
        handSize: 0.8,
        pinchRatio: 1.0
      },
      right: {
        currentGesture: 'IDLE',
        pendingGesture: 'IDLE',
        stableCount: 0,
        firstSeenTime: 0,
        lastUpdatedTime: 0,
        confidence: 0.0,
        candidateGesture: 'IDLE',
        candidateConfidence: 0.0,
        handSize: 0.8,
        pinchRatio: 1.0
      }
    };

    // Pre-allocated result payload to guarantee zero garbage collection in animation loop
    this._processResult = {
      left: {
        gesture: 'IDLE',
        confidence: 0.0,
        timestamp: 0,
        pinch: null,
        swipe: null,
        fingers: null
      },
      right: {
        gesture: 'IDLE',
        confidence: 0.0,
        timestamp: 0,
        pinch: null,
        swipe: null,
        fingers: null
      },
      primaryHand: null,
      gesture: 'IDLE',
      handSize: 0.8,
      pinchRatio: 1.0,
      pinch: null,
      swipe: null,
      fingers: null
    };
  }

  /**
   * Pure gesture classification for a single hand based on biomechanical metrics and landmarks.
   *
   * @param {Object} handState - Hand tracking state from LandmarkProcessor
   * @returns {{ gesture: string, confidence: number, handSize: number, pinchRatio: number }}
   */
  classify(handState) {
    if (!handState || !handState.detected) {
      return {
        gesture: 'IDLE',
        confidence: 0.0,
        handSize: 0.8,
        pinchRatio: 1.0
      };
    }

    const cfg = this._cfg || AppConfig.gestures;
    const minConf = (cfg && cfg.minConfidence) ? cfg.minConfidence : 0.45;

    if (handState.confidence !== undefined && handState.confidence < minConf) {
      return {
        gesture: 'IDLE',
        confidence: 0.0,
        handSize: handState.handSize || 0.8,
        pinchRatio: 1.0
      };
    }

    const lm = handState.landmarks;
    const handSize = Math.max(0.12, handState.handSize || dist3(lm[0], lm[9]));
    const pinchDist = dist3(lm[4], lm[8]);
    const pinchRatio = pinchDist / handSize;
    const handSpeed = handState.handSpeed || 0.0;
    const m = handState.metrics;

    // -------------------------------------------------------------------------
    // 1. PINCH DETECTION (Preserved precision thumb-to-index proximity)
    // -------------------------------------------------------------------------
    const pinchThresh = cfg.pinchThreshold || 0.25;
    if (pinchRatio < pinchThresh) {
      const pinchConf = Math.max(0.0, Math.min(1.0, 1.0 - (pinchRatio / pinchThresh)));
      return {
        gesture: 'PINCH',
        confidence: pinchConf,
        handSize,
        pinchRatio
      };
    }

    // -------------------------------------------------------------------------
    // 2. BIOMECHANICAL & ANATOMICAL METRIC EXTRACTION
    // -------------------------------------------------------------------------
    let isFist = false;
    let isOpen = false;
    let fistScore = 0.0;
    let openScore = 0.0;

    const fistCfg = (cfg && cfg.fist) ? cfg.fist : {
      maxOpenness: 0.30,
      minFingerCurl: 0.65,
      maxFingerExtension: 0.35,
      minThumbCurl: 0.45,
      minThumbOpposition: 0.30,
      minFlexionTotalDeg: 130.0
    };

    const openCfg = (cfg && cfg.openPalm) ? cfg.openPalm : {
      minOpenness: 0.65,
      minFingerExtension: 0.65,
      maxFingerCurl: 0.35,
      minThumbExtension: 0.40,
      maxThumbFlexionDeg: 65.0
    };

    // If Phase 2 biomechanical metrics are available, use full kinematic validation
    if (m && m.fingerCurl && m.fingerExtension && m.fingerFlexion) {
      const fc = m.fingerCurl;
      const fe = m.fingerExtension;
      const ff = m.fingerFlexion;
      const openness = m.handOpenness !== undefined ? m.handOpenness : 0.5;

      // Check 4 fingers (index, middle, ring, pinky)
      const indexFist = fc.index >= fistCfg.minFingerCurl && fe.index <= fistCfg.maxFingerExtension;
      const middleFist = fc.middle >= fistCfg.minFingerCurl && fe.middle <= fistCfg.maxFingerExtension;
      const ringFist = fc.ring >= fistCfg.minFingerCurl && fe.ring <= fistCfg.maxFingerExtension;
      const pinkyFist = fc.pinky >= fistCfg.minFingerCurl && fe.pinky <= fistCfg.maxFingerExtension;

      const thumbFist = (fc.thumb >= fistCfg.minThumbCurl) ||
                        (m.thumbOpposition >= fistCfg.minThumbOpposition) ||
                        (ff.thumb.total >= 70.0);

      const allFourFist = indexFist && middleFist && ringFist && pinkyFist;

      if (allFourFist && thumbFist && openness <= fistCfg.maxOpenness) {
        isFist = true;
        const avgCurl = (fc.index + fc.middle + fc.ring + fc.pinky + fc.thumb) * 0.2;
        fistScore = avgCurl * (1.0 - openness);
      }

      // Check Open Palm criteria
      const indexOpen = fe.index >= openCfg.minFingerExtension && fc.index <= openCfg.maxFingerCurl;
      const middleOpen = fe.middle >= openCfg.minFingerExtension && fc.middle <= openCfg.maxFingerCurl;
      const ringOpen = fe.ring >= openCfg.minFingerExtension && fc.ring <= openCfg.maxFingerCurl;
      const pinkyOpen = fe.pinky >= openCfg.minFingerExtension && fc.pinky <= openCfg.maxFingerCurl;

      const thumbOpen = (fe.thumb >= openCfg.minThumbExtension) &&
                        (ff.thumb.total <= openCfg.maxThumbFlexionDeg);

      const allFourOpen = indexOpen && middleOpen && ringOpen && pinkyOpen;

      if (allFourOpen && thumbOpen && openness >= openCfg.minOpenness) {
        isOpen = true;
        const avgExt = (fe.index + fe.middle + fe.ring + fe.pinky + fe.thumb) * 0.2;
        openScore = avgExt * openness;
      }
    }

    // Physical geometric landmark fallbacks & reinforcement (anatomical distance checks)
    const wrist = lm[0];
    const dIndexTip = dist3(lm[8], wrist);
    const dIndexPip = dist3(lm[6], wrist);
    const dMiddleTip = dist3(lm[12], wrist);
    const dMiddlePip = dist3(lm[10], wrist);
    const dRingTip = dist3(lm[16], wrist);
    const dRingPip = dist3(lm[14], wrist);
    const dPinkyTip = dist3(lm[20], wrist);
    const dPinkyPip = dist3(lm[18], wrist);

    const geomCurled = (
      dIndexTip < dIndexPip &&
      dMiddleTip < dMiddlePip &&
      dRingTip < dRingPip &&
      dPinkyTip < dPinkyPip
    );

    const geomExtended = (
      dIndexTip > dIndexPip &&
      dMiddleTip > dMiddlePip &&
      dRingTip > dRingPip &&
      dPinkyTip > dPinkyPip
    );

    // If metrics weren't present, resolve using geometric fallbacks
    if (!m || !m.fingerCurl) {
      if (geomCurled) {
        isFist = true;
        fistScore = 0.85;
      } else if (geomExtended) {
        isOpen = true;
        openScore = 0.85;
      }
    } else {
      // Metric & geometric reinforcement: boost confidence when geometric checks confirm biomechanics
      if (isFist && geomCurled) {
        fistScore = Math.min(1.0, fistScore + 0.15);
      }
      if (isOpen && geomExtended) {
        openScore = Math.min(1.0, openScore + 0.15);
      }
    }

    // -------------------------------------------------------------------------
    // 3. GESTURE ARBITRATION & CANDIDATE RESOLUTION
    // -------------------------------------------------------------------------
    // Fist takes priority over Open Palm when tightly curled
    if (isFist) {
      return {
        gesture: 'FIST',
        confidence: Math.max(0.6, Math.min(1.0, fistScore)),
        handSize,
        pinchRatio
      };
    }

    if (isOpen) {
      // Dynamic SPREAD burst (open palm moving with rapid kinematic velocity)
      const spreadThresh = cfg.spreadSpeedThreshold || 1.85;
      if (handSpeed > spreadThresh) {
        return {
          gesture: 'SPREAD',
          confidence: Math.max(0.6, Math.min(1.0, openScore)),
          handSize,
          pinchRatio
        };
      }
      return {
        gesture: 'OPEN',
        confidence: Math.max(0.6, Math.min(1.0, openScore)),
        handSize,
        pinchRatio
      };
    }

    // Ambiguous transitional pose: return neutral IDLE to avoid false positives
    return {
      gesture: 'IDLE',
      confidence: 0.0,
      handSize,
      pinchRatio
    };
  }

  /**
   * Process both left and right hands with independent temporal stability filtering.
   *
   * @param {Object} hands - Dual-hand container from LandmarkProcessor ({ left, right })
   * @param {number} currentTimeMs - Current timestamp in milliseconds
   * @param {string|null} [primaryHandSide=null] - Selected primary hand ('left'|'right'|null)
   * @returns {Object} Full gesture status payload
   */
  process(hands, currentTimeMs, primaryHandSide = null) {
    const cfg = this._cfg || AppConfig.gestures;
    const hysteresisFrames = (cfg && cfg.hysteresisFrames) ? cfg.hysteresisFrames : 3;
    const holdDurationMs = (cfg && cfg.transition && cfg.transition.holdDurationMs) ? cfg.transition.holdDurationMs : 65;
    const lossGraceMs = (cfg && cfg.transition && cfg.transition.handLossResetGraceMs) ? cfg.transition.handLossResetGraceMs : 200;

    // Synchronize sub-detectors for pinch, swipe, and individual fingers (Phase 3, Step 3.2)
    const pinchRes = this.pinchDetector.process(hands, currentTimeMs);
    const swipeRes = this.swipeDetector.process(hands, currentTimeMs);
    const fingerRes = this.fingerDetector.process(hands, currentTimeMs);

    // Process both hands independently
    for (const side of ['left', 'right']) {
      const handState = hands ? hands[side] : null;
      const tracker = this._trackers[side];

      if (handState && handState.detected) {
        const evalResult = this.classify(handState);
        tracker.candidateGesture = evalResult.gesture;
        tracker.candidateConfidence = evalResult.confidence;
        tracker.handSize = evalResult.handSize;
        tracker.pinchRatio = evalResult.pinchRatio;

        // Temporal stability filtering & hysteresis
        if (evalResult.gesture === tracker.pendingGesture) {
          tracker.stableCount++;
          const duration = currentTimeMs - tracker.firstSeenTime;

          if (tracker.stableCount >= hysteresisFrames && duration >= holdDurationMs) {
            if (tracker.currentGesture !== evalResult.gesture) {
              tracker.currentGesture = evalResult.gesture;
              tracker.lastUpdatedTime = currentTimeMs;
              tracker.confidence = evalResult.confidence;

              stateManager.setHandGesture(side, evalResult.gesture, evalResult.confidence, currentTimeMs);
            }
          }
        } else {
          tracker.pendingGesture = evalResult.gesture;
          tracker.stableCount = 1;
          tracker.firstSeenTime = currentTimeMs;
        }
      } else {
        // Hand is not detected
        tracker.candidateGesture = 'IDLE';
        tracker.candidateConfidence = 0.0;

        const lastSeen = handState ? handState.lastSeenTimestamp : 0;
        const timeSinceLost = currentTimeMs - lastSeen;

        if (timeSinceLost > lossGraceMs) {
          if (tracker.currentGesture !== 'IDLE') {
            tracker.currentGesture = 'IDLE';
            tracker.pendingGesture = 'IDLE';
            tracker.stableCount = 0;
            tracker.confidence = 0.0;
            tracker.lastUpdatedTime = currentTimeMs;

            stateManager.setHandGesture(side, 'IDLE', 0.0, currentTimeMs);
          }
        }
      }
    }

    // Synchronize primary hand for downstream rendering & interaction backward compatibility
    const activePrimary = primaryHandSide || stateManager.state.tracking.primaryHand;
    let primaryGesture = 'IDLE';
    let primaryHandSize = 0.8;
    let primaryPinchRatio = 1.0;

    if (activePrimary && this._trackers[activePrimary] && hands && hands[activePrimary] && hands[activePrimary].detected) {
      const pTracker = this._trackers[activePrimary];
      primaryGesture = pTracker.currentGesture;
      primaryHandSize = pTracker.handSize;
      primaryPinchRatio = pTracker.pinchRatio;
    } else {
      // Fallback: if one hand is detected, select it
      const leftActive = hands && hands.left && hands.left.detected;
      const rightActive = hands && hands.right && hands.right.detected;
      if (leftActive && !rightActive) {
        primaryGesture = this._trackers.left.currentGesture;
        primaryHandSize = this._trackers.left.handSize;
        primaryPinchRatio = this._trackers.left.pinchRatio;
      } else if (rightActive && !leftActive) {
        primaryGesture = this._trackers.right.currentGesture;
        primaryHandSize = this._trackers.right.handSize;
        primaryPinchRatio = this._trackers.right.pinchRatio;
      }
    }

    // Build zero-allocation output object
    const res = this._processResult;
    res.left.gesture = this._trackers.left.currentGesture;
    res.left.confidence = this._trackers.left.confidence;
    res.left.timestamp = this._trackers.left.lastUpdatedTime;
    res.left.pinch = pinchRes.left;
    res.left.swipe = swipeRes.left;
    res.left.fingers = fingerRes.left;

    res.right.gesture = this._trackers.right.currentGesture;
    res.right.confidence = this._trackers.right.confidence;
    res.right.timestamp = this._trackers.right.lastUpdatedTime;
    res.right.pinch = pinchRes.right;
    res.right.swipe = swipeRes.right;
    res.right.fingers = fingerRes.right;

    res.primaryHand = activePrimary;
    res.gesture = primaryGesture;
    res.handSize = primaryHandSize;
    res.pinchRatio = primaryPinchRatio;

    const primarySide = activePrimary || 'right';
    res.pinch = pinchRes[primarySide] || pinchRes.right;
    res.swipe = swipeRes[primarySide] || swipeRes.right;
    res.fingers = fingerRes[primarySide] || fingerRes.right;

    return res;
  }

  /**
   * Reset all temporal filters and hand gesture states
   */
  reset() {
    this.pinchDetector.reset();
    this.swipeDetector.reset();
    this.fingerDetector.reset();

    for (const side of ['left', 'right']) {
      const t = this._trackers[side];
      t.currentGesture = 'IDLE';
      t.pendingGesture = 'IDLE';
      t.stableCount = 0;
      t.firstSeenTime = 0;
      t.lastUpdatedTime = 0;
      t.confidence = 0.0;
      t.candidateGesture = 'IDLE';
      t.candidateConfidence = 0.0;
      stateManager.setHandGesture(side, 'IDLE', 0.0, performance.now());
    }
  }

  /**
   * Get current gesture state for a specific hand side
   * @param {'left'|'right'} side
   * @returns {{ gesture: string, confidence: number, timestamp: number }}
   */
  getHandGesture(side) {
    const t = this._trackers[side];
    return t ? {
      gesture: t.currentGesture,
      confidence: t.confidence,
      timestamp: t.lastUpdatedTime
    } : { gesture: 'IDLE', confidence: 0.0, timestamp: 0 };
  }

  /**
   * Get pinch state for a specific hand side
   * @param {'left'|'right'} side
   * @returns {Object}
   */
  getPinch(side) {
    return this.pinchDetector.getPinch(side);
  }

  /**
   * Get swipe state for a specific hand side
   * @param {'left'|'right'} side
   * @returns {Object}
   */
  getSwipe(side) {
    return this.swipeDetector.getSwipe(side);
  }

  /**
   * Get individual finger states for a specific hand side
   * @param {'left'|'right'} side
   * @returns {Object}
   */
  getFingers(side) {
    return this.fingerDetector.getFingers(side);
  }
}

/**
 * Singleton instance of GestureRecognizer
 */
export const gestureRecognizer = new GestureRecognizer();

// Expose safe global debug reference for browser console inspection
if (typeof window !== 'undefined' && !window.gestureRecognizer) {
  window.gestureRecognizer = gestureRecognizer;
}
