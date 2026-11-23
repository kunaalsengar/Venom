/**
 * PROJECT NEXUS — Independent 3D Hand Controller
 * Encapsulates single-hand 3D spatial state, smoothing, velocity tracking,
 * and holographic cursor integration for either the left or right hand.
 *
 * Responsibilities:
 * - Tracks 3D interaction position, palm center, index tip, and pinch focal point.
 * - Applies frame-rate independent Exponential Moving Average smoothing.
 * - Computes instantaneous 3D velocity and kinematic speed.
 * - Seamlessly manages the attached HologramCursor.
 * - Guarantees zero heap allocations per frame.
 *
 * @module interaction/HandController
 */

import * as THREE from 'three';
import { HologramCursor } from '../hologram/HologramCursor.js';
import { AppConfig } from '../config/AppConfig.js';
import { expDecayAlpha, dist3 } from '../utils/MathUtils.js';
import { stateManager } from '../core/StateManager.js';

export class HandController {
  /**
   * @param {'left'|'right'} side
   */
  constructor(side) {
    this.side = side;
    this._cfg = AppConfig.interaction;

    // Spatial 3D coordinates (Pre-allocated)
    this.position = new THREE.Vector3(0, 0, 0);
    this.targetPosition = new THREE.Vector3(0, 0, 0);
    this.prevPosition = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.palmCenter = new THREE.Vector3(0, 0, 0);
    this.indexTip = new THREE.Vector3(0, 0, 0);
    this.pinchPoint = new THREE.Vector3(0, 0, 0);
    this.wrist = new THREE.Vector3(0, 0, 0);
    this.palmNormal = new THREE.Vector3(0, 0, 1);

    // Tracking & kinematic properties
    this.detected = false;
    this.confidence = 0.0;
    this.speed = 0.0;
    this.handSize = 0.8;
    this.gesture = 'IDLE';
    this.isPinching = false;
    this.pinchDistance = 1.0;
    this.lastSeenTimestamp = 0;
    this.hasValidHistory = false;

    // Visual 3D Holographic Cursor
    this.cursor = new HologramCursor(side);
  }

  /**
   * Update controller state from smoothed hand landmarks.
   * ZERO HEAP ALLOCATIONS.
   *
   * @param {Object} handState - Hand tracking state from LandmarkProcessor
   * @param {number} dt - Frame delta time in seconds
   * @param {number} currentTimeMs - High-resolution timestamp in ms
   */
  update(handState, dt, currentTimeMs) {
    if (handState && handState.detected && handState.landmarks && handState.landmarks.length >= 21) {
      const lm = handState.landmarks;

      this.detected = true;
      this.confidence = handState.confidence !== undefined ? handState.confidence : 1.0;
      this.handSize = handState.handSize || 0.8;
      this.gesture = handState.gesture || (stateManager?.state?.gestures?.hands?.[this.side]?.gesture) || 'IDLE';

      // 1. Copy key landmark reference positions
      this.wrist.copy(lm[0]);
      this.indexTip.copy(lm[8]);
      this.palmCenter.copy(handState.palmCenter);

      // 2. Compute Pinch Focal Point (midpoint between Thumb Tip [4] and Index Tip [8])
      this.pinchPoint.copy(lm[4]).lerp(lm[8], 0.5);

      // Check pinch state
      const pinchDist = dist3(lm[4], lm[8]);
      this.pinchDistance = pinchDist / Math.max(0.12, this.handSize);
      this.isPinching = this.pinchDistance < (AppConfig.gestures.pinchThreshold || 0.25);

      // 3. Determine active 3D interaction position
      if (this.isPinching) {
        // When pinching, cursor snaps to pinch focal point
        this.targetPosition.copy(this.pinchPoint);
      } else {
        // In free pointing / open mode, cursor leads at index fingertip
        this.targetPosition.copy(this.indexTip);
      }

      // 4. Smooth positional tracking
      const isReacquisition = !this.hasValidHistory || (currentTimeMs - this.lastSeenTimestamp > 180);
      const alpha = expDecayAlpha(this._cfg.smoothingAlpha || 20.0, dt);

      if (isReacquisition) {
        // Snap immediately on acquisition to prevent laggy dragging
        this.position.copy(this.targetPosition);
        this.prevPosition.copy(this.targetPosition);
        this.velocity.set(0, 0, 0);
        this.speed = 0.0;
      } else {
        // Smooth interpolation
        this.position.lerp(this.targetPosition, alpha);

        // Compute 3D velocity and speed
        const safeDt = Math.max(0.001, dt);
        this.velocity.copy(this.position).sub(this.prevPosition).divideScalar(safeDt);
        this.speed = this.velocity.length();
        this.prevPosition.copy(this.position);
      }

      // Copy palm normal if available from metrics
      if (handState.metrics && handState.metrics.palmNormal) {
        this.palmNormal.copy(handState.metrics.palmNormal);
      }

      this.hasValidHistory = true;
      this.lastSeenTimestamp = currentTimeMs;

      // 5. Update visual 3D cursor
      this.cursor.position.copy(this.position);
      this.cursor.setTrackingState(
        true,
        this.confidence,
        this.gesture,
        this.isPinching,
        this.pinchDistance
      );
    } else {
      // Hand not detected
      this.detected = false;
      this.confidence = 0.0;
      this.speed = 0.0;
      this.velocity.set(0, 0, 0);

      // Fade out cursor
      this.cursor.setTrackingState(false, 0.0, 'IDLE', false, 1.0);
    }

    // Always update cursor animation and opacity decay
    this.cursor.update(currentTimeMs * 0.001, dt);
  }
}
