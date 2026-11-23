/**
 * PROJECT NEXUS — Two-Hand Spatial Interaction Metrics
 * Pure mathematical calculation engine for dual-hand spatial measurements.
 *
 * Computes:
 * - Distance between hands
 * - 3D Midpoint between hands
 * - Relative directional displacements (deltaX, deltaY, deltaZ)
 * - Hand span ratio normalized by anatomical hand scale
 * - Tracking confidence & two-hand availability
 *
 * Optimized with preallocated vectors to guarantee ZERO heap allocations in 60 FPS loops.
 *
 * @module interaction/TwoHandMetrics
 */

import * as THREE from 'three';
import { dist3, clamp } from '../utils/MathUtils.js';

export class TwoHandMetrics {
  constructor() {
    // Pre-allocated return payload to guarantee zero garbage collection
    this.metrics = {
      available: false,
      distance: 0.0,
      midpoint: new THREE.Vector3(0, 0, 0),
      deltaX: 0.0,
      deltaY: 0.0,
      deltaZ: 0.0,
      spanRatio: 1.0,
      confidence: 0.0,
      relativeAngleDeg: 0.0
    };
  }

  /**
   * Compute spatial relationship between left and right hand controllers.
   *
   * @param {import('./HandController.js').HandController} leftCtrl
   * @param {import('./HandController.js').HandController} rightCtrl
   * @returns {typeof this.metrics} Computed spatial metrics
   */
  compute(leftCtrl, rightCtrl) {
    const m = this.metrics;

    const leftDetected = leftCtrl && leftCtrl.detected;
    const rightDetected = rightCtrl && rightCtrl.detected;

    if (!leftDetected || !rightDetected) {
      // Safe reset to prevent stale data or NaN values
      m.available = false;
      m.distance = 0.0;
      m.midpoint.set(0, 0, 0);
      m.deltaX = 0.0;
      m.deltaY = 0.0;
      m.deltaZ = 0.0;
      m.spanRatio = 1.0;
      m.confidence = 0.0;
      m.relativeAngleDeg = 0.0;
      return m;
    }

    const pL = leftCtrl.position;
    const pR = rightCtrl.position;

    // 1. Euclidean distance
    const dist = dist3(pL, pR);
    m.distance = dist;

    // 2. 3D Midpoint
    m.midpoint.set(
      (pL.x + pR.x) * 0.5,
      (pL.y + pR.y) * 0.5,
      (pL.z + pR.z) * 0.5
    );

    // 3. Directional relative displacements (Right relative to Left)
    m.deltaX = pR.x - pL.x;
    m.deltaY = pR.y - pL.y;
    m.deltaZ = pR.z - pL.z;

    // 4. Normalized span ratio relative to average anatomical hand scale
    const avgHandSize = Math.max(0.08, ((leftCtrl.handSize || 0.8) + (rightCtrl.handSize || 0.8)) * 0.5);
    m.spanRatio = dist / avgHandSize;

    // 5. Combined tracking confidence
    m.confidence = (leftCtrl.confidence + rightCtrl.confidence) * 0.5;

    // 6. Planar orientation angle in degrees in the coronal (XY) plane
    m.relativeAngleDeg = Math.atan2(m.deltaY, m.deltaX) * (180.0 / Math.PI);

    m.available = true;
    return m;
  }
}
