/**
 * PROJECT NEXUS — Independent Pinch Detector (Phase 3, Step 3.2)
 *
 * Provides dedicated, independent pinch gesture detection for both hands with:
 * - Hand-scale normalized thumb-to-index distance tracking.
 * - Hysteresis between activation and release to eliminate edge flickering.
 * - Discrete transition event dispatching (PINCH_START, PINCH_END).
 * - Per-hand lifecycle tracking (startedAt, releasedAt, duration).
 * - Zero heap allocations during high-frequency 60 FPS animation loops.
 *
 * @module gestures/PinchDetector
 */

import { AppConfig } from '../config/AppConfig.js';
import { stateManager } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { dist3, clamp } from '../utils/MathUtils.js';

export class PinchDetector {
  constructor() {
    this._cfg = AppConfig.gestures.pinch || {
      activationDistance: 0.22,
      releaseDistance: 0.30,
      snapThreshold: 1.25,
      hysteresisFrames: 2
    };

    // Per-hand independent pinch state trackers
    this._trackers = {
      left: {
        active: false,
        pendingActive: false,
        stableCount: 0,
        distance: 1.0,
        confidence: 0.0,
        startedAt: 0,
        releasedAt: 0
      },
      right: {
        active: false,
        pendingActive: false,
        stableCount: 0,
        distance: 1.0,
        confidence: 0.0,
        startedAt: 0,
        releasedAt: 0
      }
    };

    // Pre-allocated return payload to guarantee zero GC
    this._result = {
      left: { active: false, distance: 1.0, confidence: 0.0, startedAt: 0, releasedAt: 0 },
      right: { active: false, distance: 1.0, confidence: 0.0, startedAt: 0, releasedAt: 0 }
    };
  }

  /**
   * Process both left and right hands for pinch gestures.
   *
   * @param {Object} hands - Container of left and right hand states from LandmarkProcessor
   * @param {number} currentTimeMs - Current timestamp in milliseconds
   * @returns {Object} Per-hand pinch status
   */
  process(hands, currentTimeMs) {
    const cfg = this._cfg;
    const actDist = cfg.activationDistance || 0.22;
    const relDist = cfg.releaseDistance || 0.30;
    const hystFrames = cfg.hysteresisFrames || 2;
    const lossGraceMs = AppConfig.gestures?.transition?.handLossResetGraceMs || 200;

    for (const side of ['left', 'right']) {
      const handState = hands ? hands[side] : null;
      const tracker = this._trackers[side];

      if (handState && handState.detected) {
        const lm = handState.landmarks;
        const handSize = Math.max(0.12, handState.handSize || dist3(lm[0], lm[9]));
        const pinchDist = dist3(lm[4], lm[8]);
        const normDist = pinchDist / handSize;

        tracker.distance = normDist;

        // Calculate pinch confidence based on distance
        let conf = 0.0;
        if (normDist <= actDist) {
          conf = clamp(1.0 - (normDist / actDist), 0.0, 1.0) * 0.5 + 0.5;
        } else if (normDist <= relDist) {
          conf = clamp(1.0 - ((normDist - actDist) / (relDist - actDist)), 0.0, 1.0) * 0.5;
        }
        tracker.confidence = conf;

        // Evaluate candidate state using hysteresis
        let candidateActive = tracker.active;
        if (!tracker.active && normDist <= actDist) {
          candidateActive = true;
        } else if (tracker.active && normDist >= relDist) {
          candidateActive = false;
        }

        // Apply stability frames
        if (candidateActive === tracker.pendingActive) {
          tracker.stableCount++;
          if (tracker.stableCount >= hystFrames && tracker.active !== candidateActive) {
            tracker.active = candidateActive;
            if (candidateActive) {
              tracker.startedAt = currentTimeMs;
              eventBus.emit(Events.PINCH_START, {
                hand: side,
                distance: normDist,
                confidence: tracker.confidence,
                startedAt: currentTimeMs
              });
            } else {
              tracker.releasedAt = currentTimeMs;
              eventBus.emit(Events.PINCH_END, {
                hand: side,
                distance: normDist,
                confidence: tracker.confidence,
                releasedAt: currentTimeMs,
                duration: currentTimeMs - tracker.startedAt
              });
            }

            stateManager.updatePinchState(side, {
              active: tracker.active,
              distance: tracker.distance,
              confidence: tracker.confidence,
              startedAt: tracker.startedAt,
              releasedAt: tracker.releasedAt
            });
          }
        } else {
          tracker.pendingActive = candidateActive;
          tracker.stableCount = 1;
        }

        // Keep stateManager distance continuously up to date
        stateManager.updatePinchState(side, {
          active: tracker.active,
          distance: tracker.distance,
          confidence: tracker.confidence,
          startedAt: tracker.startedAt,
          releasedAt: tracker.releasedAt
        });
      } else {
        // Hand not detected
        const lastSeen = handState ? handState.lastSeenTimestamp : 0;
        if (currentTimeMs - lastSeen > lossGraceMs) {
          if (tracker.active) {
            tracker.active = false;
            tracker.pendingActive = false;
            tracker.stableCount = 0;
            tracker.releasedAt = currentTimeMs;

            eventBus.emit(Events.PINCH_END, {
              hand: side,
              distance: 1.0,
              confidence: 0.0,
              releasedAt: currentTimeMs,
              duration: currentTimeMs - tracker.startedAt
            });

            stateManager.updatePinchState(side, {
              active: false,
              distance: 1.0,
              confidence: 0.0,
              startedAt: tracker.startedAt,
              releasedAt: tracker.releasedAt
            });
          }
          tracker.distance = 1.0;
          tracker.confidence = 0.0;
        }
      }

      // Populate pre-allocated result
      const out = this._result[side];
      out.active = tracker.active;
      out.distance = tracker.distance;
      out.confidence = tracker.confidence;
      out.startedAt = tracker.startedAt;
      out.releasedAt = tracker.releasedAt;
    }

    return this._result;
  }

  /**
   * Reset tracking state for both hands
   */
  reset() {
    for (const side of ['left', 'right']) {
      const t = this._trackers[side];
      t.active = false;
      t.pendingActive = false;
      t.stableCount = 0;
      t.distance = 1.0;
      t.confidence = 0.0;
      t.startedAt = 0;
      t.releasedAt = 0;
      stateManager.updatePinchState(side, {
        active: false,
        distance: 1.0,
        confidence: 0.0,
        startedAt: 0,
        releasedAt: 0
      });
    }
  }

  /**
   * Get pinch state for a specific hand side
   * @param {'left'|'right'} side
   * @returns {{ active: boolean, distance: number, confidence: number, startedAt: number, releasedAt: number }}
   */
  getPinch(side) {
    const t = this._trackers[side];
    return t ? {
      active: t.active,
      distance: t.distance,
      confidence: t.confidence,
      startedAt: t.startedAt,
      releasedAt: t.releasedAt
    } : { active: false, distance: 1.0, confidence: 0.0, startedAt: 0, releasedAt: 0 };
  }
}

/**
 * Singleton instance of PinchDetector
 */
export const pinchDetector = new PinchDetector();

if (typeof window !== 'undefined' && !window.pinchDetector) {
  window.pinchDetector = pinchDetector;
}
