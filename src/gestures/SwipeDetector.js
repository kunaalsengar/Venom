/**
 * PROJECT NEXUS — Independent Directional Swipe Detector (Phase 3, Step 3.2)
 *
 * Implements discrete directional swipe gesture detection (LEFT, RIGHT, UP, DOWN)
 * independently for both left and right hands with:
 * - Timestamp-based velocity calculation (frame-rate independent).
 * - Stable reference point tracking (palmCenter / wrist).
 * - Dominant axis filtering (rejects accidental diagonal vectors).
 * - Hand-scale normalized displacement thresholds.
 * - Cooldown management to guarantee discrete single-fire event emissions.
 * - Full alignment with mirrored camera space (LEFT and RIGHT match visual user movement).
 * - Pre-allocated circular trajectory buffers (zero allocations per frame).
 *
 * @module gestures/SwipeDetector
 */

import { AppConfig } from '../config/AppConfig.js';
import { stateManager } from '../core/StateManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { clamp } from '../utils/MathUtils.js';

const BUFFER_CAPACITY = 16;

export class SwipeDetector {
  constructor() {
    this._cfg = AppConfig.gestures.swipe || {
      minVelocity: 1.5,
      minDisplacement: 0.20,
      maxDurationMs: 320,
      cooldownMs: 350,
      axisDominanceRatio: 1.35
    };

    // Per-hand circular trajectory history buffers
    this._history = {
      left: {
        points: Array.from({ length: BUFFER_CAPACITY }, () => ({ x: 0, y: 0, z: 0, time: 0 })),
        count: 0,
        head: 0,
        lastSwipeTime: 0,
        lastSwipeDirection: null,
        lastSwipeVelocity: 0.0,
        lastSwipeConfidence: 0.0
      },
      right: {
        points: Array.from({ length: BUFFER_CAPACITY }, () => ({ x: 0, y: 0, z: 0, time: 0 })),
        count: 0,
        head: 0,
        lastSwipeTime: 0,
        lastSwipeDirection: null,
        lastSwipeVelocity: 0.0,
        lastSwipeConfidence: 0.0
      }
    };

    // Pre-allocated result payload
    this._result = {
      left: { direction: null, velocity: 0.0, confidence: 0.0, timestamp: 0 },
      right: { direction: null, velocity: 0.0, confidence: 0.0, timestamp: 0 }
    };
  }

  /**
   * Process both hands for directional swipe gestures.
   *
   * @param {Object} hands - Dual-hand state from LandmarkProcessor
   * @param {number} currentTimeMs - Current timestamp in milliseconds
   * @returns {Object} Per-hand swipe state
   */
  process(hands, currentTimeMs) {
    const cfg = this._cfg;
    const minVel = cfg.minVelocity || 1.5;
    const minDispRel = cfg.minDisplacement || 0.20;
    const maxDur = cfg.maxDurationMs || 320;
    const cooldown = cfg.cooldownMs || 350;
    const axisRatio = cfg.axisDominanceRatio || 1.35;
    const lossGraceMs = AppConfig.gestures?.transition?.handLossResetGraceMs || 200;

    for (const side of ['left', 'right']) {
      const handState = hands ? hands[side] : null;
      const hist = this._history[side];
      const res = this._result[side];

      // Default result to idle unless a new swipe fires
      res.direction = null;
      res.velocity = 0.0;
      res.confidence = 0.0;
      res.timestamp = 0;

      if (handState && handState.detected) {
        const refPoint = handState.palmCenter;
        const handSize = Math.max(0.12, handState.handSize || 0.8);
        const minDisp = minDispRel * handSize;

        // Push current reference position into ring buffer
        const idx = hist.head;
        hist.points[idx].x = refPoint.x;
        hist.points[idx].y = refPoint.y;
        hist.points[idx].z = refPoint.z;
        hist.points[idx].time = currentTimeMs;
        hist.head = (hist.head + 1) % BUFFER_CAPACITY;
        if (hist.count < BUFFER_CAPACITY) hist.count++;

        // Only evaluate if cooldown has expired
        const timeSinceLastSwipe = currentTimeMs - hist.lastSwipeTime;
        if (timeSinceLastSwipe >= cooldown && hist.count >= 4) {
          // Look backward through history for a qualifying swipe trajectory within maxDurationMs
          let bestSwipe = null;

          for (let i = 1; i < hist.count; i++) {
            const olderIdx = (hist.head - 1 - i + BUFFER_CAPACITY) % BUFFER_CAPACITY;
            const olderPoint = hist.points[olderIdx];
            const dtMs = currentTimeMs - olderPoint.time;

            if (dtMs > maxDur) break; // Exceeded maximum swipe window duration
            if (dtMs < 45) continue;  // Window too small to calculate reliable velocity

            const dx = refPoint.x - olderPoint.x;
            const dy = refPoint.y - olderPoint.y;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            const dtSec = dtMs / 1000.0;
            const dist = Math.hypot(dx, dy);
            const vel = dist / dtSec;

            if (dist >= minDisp && vel >= minVel) {
              // Check dominant axis
              let dir = null;
              if (absDx >= absDy * axisRatio) {
                // Horizontal swipe: dx > 0 = RIGHT, dx < 0 = LEFT (mirrored camera space)
                dir = dx > 0 ? 'RIGHT' : 'LEFT';
              } else if (absDy >= absDx * axisRatio) {
                // Vertical swipe: dy > 0 = UP, dy < 0 = DOWN
                dir = dy > 0 ? 'UP' : 'DOWN';
              }

              if (dir) {
                const conf = clamp((vel / (minVel * 2.5)), 0.5, 1.0);
                if (!bestSwipe || vel > bestSwipe.velocity) {
                  bestSwipe = { direction: dir, velocity: vel, confidence: conf, timestamp: currentTimeMs };
                }
              }
            }
          }

          if (bestSwipe) {
            // Commit discrete swipe event
            hist.lastSwipeTime = currentTimeMs;
            hist.lastSwipeDirection = bestSwipe.direction;
            hist.lastSwipeVelocity = bestSwipe.velocity;
            hist.lastSwipeConfidence = bestSwipe.confidence;

            // Clear history buffer to prevent multiple triggers from the same trailing movement
            hist.count = 0;
            hist.head = 0;

            res.direction = bestSwipe.direction;
            res.velocity = bestSwipe.velocity;
            res.confidence = bestSwipe.confidence;
            res.timestamp = currentTimeMs;

            stateManager.updateSwipeState(side, bestSwipe);

            eventBus.emit(Events.SWIPE, {
              hand: side,
              direction: bestSwipe.direction,
              velocity: bestSwipe.velocity,
              confidence: bestSwipe.confidence,
              timestamp: currentTimeMs
            });
          }
        }
      } else {
        // Hand not detected: reset trajectory buffer if lost longer than grace period
        const lastSeen = handState ? handState.lastSeenTimestamp : 0;
        if (currentTimeMs - lastSeen > lossGraceMs) {
          hist.count = 0;
          hist.head = 0;
        }
      }
    }

    return this._result;
  }

  /**
   * Reset all history buffers and swipe state
   */
  reset() {
    for (const side of ['left', 'right']) {
      const h = this._history[side];
      h.count = 0;
      h.head = 0;
      h.lastSwipeTime = 0;
      h.lastSwipeDirection = null;
      h.lastSwipeVelocity = 0.0;
      h.lastSwipeConfidence = 0.0;
      stateManager.updateSwipeState(side, {
        direction: null,
        velocity: 0.0,
        confidence: 0.0,
        timestamp: 0
      });
    }
  }

  /**
   * Get latest swipe state for a specific hand side
   * @param {'left'|'right'} side
   * @returns {{ direction: string|null, velocity: number, confidence: number, timestamp: number }}
   */
  getSwipe(side) {
    const h = this._history[side];
    return h ? {
      direction: h.lastSwipeDirection,
      velocity: h.lastSwipeVelocity,
      confidence: h.lastSwipeConfidence,
      timestamp: h.lastSwipeTime
    } : { direction: null, velocity: 0.0, confidence: 0.0, timestamp: 0 };
  }
}

/**
 * Singleton instance of SwipeDetector
 */
export const swipeDetector = new SwipeDetector();

if (typeof window !== 'undefined' && !window.swipeDetector) {
  window.swipeDetector = swipeDetector;
}
