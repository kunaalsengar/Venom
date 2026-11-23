/**
 * PROJECT NEXUS — LandmarkProcessor
 * Robust two-hand landmark processing with independent Exponential Moving Average (EMA)
 * smoothing, handedness tracking, lifecycle grace management, and primary hand arbitration.
 *
 * @module tracking/LandmarkProcessor
 */

import * as THREE from 'three';
import { AppConfig } from '../config/AppConfig.js';
import {
  dist3,
  clamp,
  vectorAngle,
  computePalmNormal,
  computePalmOrientation,
  createHandMetrics
} from '../utils/MathUtils.js';
import { stateManager } from '../core/StateManager.js';

export class LandmarkProcessor {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.emaAlpha]
   * @param {number} [options.trackingLossGraceMs]
   * @param {string} [options.primaryPreference]
   */
  constructor(options = {}) {
    this._emaAlpha = options.emaAlpha || AppConfig.tracking.emaAlpha || 24.0;
    this._trackingLossGraceMs = options.trackingLossGraceMs || AppConfig.tracking.trackingLossGraceMs || 150;
    this._primaryPreference = options.primaryPreference || AppConfig.tracking.primaryHandPreference || 'right';

    // Pre-allocated scratch vectors to guarantee zero allocations in the 60 FPS loop
    this._scratchPos = new THREE.Vector3();
    this._primaryHand = null;

    /**
     * Independent Two-Hand Data Structures
     */
    this.hands = {
      left: {
        detected: false,
        hasValidHistory: false,
        handedness: 'Left',
        label: 'left',
        confidence: 0.0,
        lastSeenTimestamp: 0,
        // Pre-allocated 21 3D smoothed landmarks
        landmarks: Array.from({ length: 21 }, () => new THREE.Vector3(0, 0, 0)),
        rawLandmarks: null,
        worldLandmarks: null,
        prevWrist: new THREE.Vector3(0, 0, 0),
        palmCenter: new THREE.Vector3(0, 0, 0),
        boundingRadius: 1.8,
        wristSpeed: 0.0,
        handSpeed: 0.0,
        handSize: 0.8,
        // Pre-allocated spatial & biomechanical metrics (Phase 2, Step 2.4)
        metrics: createHandMetrics()
      },
      right: {
        detected: false,
        hasValidHistory: false,
        handedness: 'Right',
        label: 'right',
        confidence: 0.0,
        lastSeenTimestamp: 0,
        // Pre-allocated 21 3D smoothed landmarks
        landmarks: Array.from({ length: 21 }, () => new THREE.Vector3(0, 0, 0)),
        rawLandmarks: null,
        worldLandmarks: null,
        prevWrist: new THREE.Vector3(0, 0, 0),
        palmCenter: new THREE.Vector3(0, 0, 0),
        boundingRadius: 1.8,
        wristSpeed: 0.0,
        handSpeed: 0.0,
        handSize: 0.8,
        // Pre-allocated spatial & biomechanical metrics (Phase 2, Step 2.4)
        metrics: createHandMetrics()
      }
    };
  }

  /**
   * Determine handedness label ('left' or 'right') from MediaPipe metadata
   * with spatial horizontal disambiguation for mirrored webcam feeds.
   *
   * @private
   * @param {Array<Object>} handednessEntry
   * @param {number} rawX - Normalized X coordinate in raw camera space
   * @returns {{label: 'left'|'right', confidence: number}}
   */
  _classifyHandedness(handednessEntry, rawX) {
    let label = 'right';
    let confidence = 1.0;

    if (handednessEntry && handednessEntry.length > 0) {
      const item = handednessEntry[0];
      confidence = item.score !== undefined ? item.score : 1.0;
      const cat = (item.categoryName || item.displayName || '').toLowerCase();
      // MediaPipe label mapping: 'left' -> 'left', 'right' -> 'right'
      label = cat === 'left' ? 'left' : 'right';
    } else if (rawX !== undefined) {
      // Spatial fallback: mirrored feed horizontal position
      label = rawX < 0.5 ? 'right' : 'left';
    }

    return { label, confidence };
  }

  /**
   * Process raw MediaPipe detection results for up to two hands.
   * Applies independent EMA smoothing, updates speeds, palm metrics, and manages tracking loss.
   *
   * @param {Object} detection - MediaPipe result object with landmarks, worldLandmarks, handedness
   * @param {number} dt - Delta time in seconds
   * @param {number} currentTimeMs - Current high-resolution timestamp in ms
   * @param {Function} projectCoordsFn - Function mapping (u, v, z, outVec) into 3D world space
   * @returns {{detectedHandsCount: number, primaryHand: string|null, hands: Object}}
   */
  process(detection, dt, currentTimeMs, projectCoordsFn) {
    const rawHands = (detection && detection.landmarks) ? detection.landmarks : [];
    const worldHands = (detection && detection.worldLandmarks) ? detection.worldLandmarks : [];
    const handednessList = (detection && detection.handedness) ? detection.handedness : [];

    const numDetected = Math.min(rawHands.length, 2);
    const assignedHands = { left: null, right: null };

    // --- STEP 1: Hand Identity & Disambiguation ---
    if (numDetected === 1) {
      const raw0 = rawHands[0];
      const h0 = this._classifyHandedness(handednessList[0], raw0[0].x);
      assignedHands[h0.label] = {
        raw: raw0,
        world: worldHands[0] || null,
        confidence: h0.confidence
      };
    } else if (numDetected >= 2) {
      const raw0 = rawHands[0];
      const raw1 = rawHands[1];
      let h0 = this._classifyHandedness(handednessList[0], raw0[0].x);
      let h1 = this._classifyHandedness(handednessList[1], raw1[0].x);

      // If both hands are labeled identically (edge case), disambiguate horizontally
      if (h0.label === h1.label) {
        if (raw0[0].x < raw1[0].x) {
          h0.label = 'right';
          h1.label = 'left';
        } else {
          h0.label = 'left';
          h1.label = 'right';
        }
      }

      assignedHands[h0.label] = { raw: raw0, world: worldHands[0] || null, confidence: h0.confidence };
      assignedHands[h1.label] = { raw: raw1, world: worldHands[1] || null, confidence: h1.confidence };
    }

    // --- STEP 2: Independent EMA Smoothing & Metrics for Left & Right Hands ---
    const alpha = 1.0 - Math.exp(-this._emaAlpha * dt);
    let detectedCount = 0;

    for (const side of ['left', 'right']) {
      const handState = this.hands[side];
      const assigned = assignedHands[side];

      if (assigned) {
        detectedCount++;
        handState.detected = true;
        handState.confidence = assigned.confidence;
        handState.rawLandmarks = assigned.raw;
        handState.worldLandmarks = assigned.world;

        const timeSinceLastSeen = currentTimeMs - handState.lastSeenTimestamp;
        const isReacquisition = !handState.hasValidHistory || (timeSinceLastSeen > this._trackingLossGraceMs);

        // Project and smooth each of the 21 anatomical landmarks
        for (let i = 0; i < 21; i++) {
          const pt = assigned.raw[i];
          // Mirror horizontal coordinate: u = 1.0 - pt.x
          projectCoordsFn(1.0 - pt.x, pt.y, pt.z, this._scratchPos);

          if (isReacquisition) {
            // Immediate snap on initial acquisition or after extended tracking loss
            handState.landmarks[i].copy(this._scratchPos);
          } else {
            // Smooth Exponential Moving Average interpolation
            handState.landmarks[i].lerp(this._scratchPos, alpha);
          }
        }

        // Measure anatomical hand scale (distance between Wrist [0] and Middle MCP [9])
        const wrist = handState.landmarks[0];
        const middleMCP = handState.landmarks[9];
        handState.handSize = Math.max(0.12, dist3(wrist, middleMCP));

        // Measure wrist velocity and hand speed
        if (!isReacquisition) {
          const wristDist = dist3(wrist, handState.prevWrist);
          handState.wristSpeed = wristDist / Math.max(0.001, dt);
          handState.handSpeed = handState.wristSpeed;
        } else {
          handState.wristSpeed = 0.0;
          handState.handSpeed = 0.0;
        }
        handState.prevWrist.copy(wrist);

        // Compute palm center centroid (Wrist [0], Index MCP [5], Middle MCP [9], Pinky MCP [17])
        handState.palmCenter.set(0, 0, 0);
        handState.palmCenter.add(handState.landmarks[0]);
        handState.palmCenter.add(handState.landmarks[5]);
        handState.palmCenter.add(handState.landmarks[9]);
        handState.palmCenter.add(handState.landmarks[17]);
        handState.palmCenter.multiplyScalar(0.25);

        // Compute enclosing bounding sphere radius
        let maxR = 0;
        for (let i = 0; i < 21; i++) {
          const r = dist3(handState.landmarks[i], handState.palmCenter);
          if (r > maxR) maxR = r;
        }
        handState.boundingRadius = maxR + 0.35 * handState.handSize;

        // Calculate 3D spatial metrics and biomechanical joint angles (Phase 2, Step 2.4)
        this._computeBiomechanicalMetrics(handState);

        handState.hasValidHistory = true;
        handState.lastSeenTimestamp = currentTimeMs;
      } else {
        // Hand not detected in this frame
        handState.detected = false;
        handState.confidence = 0.0;

        const timeSinceLastSeen = currentTimeMs - handState.lastSeenTimestamp;
        if (timeSinceLastSeen > this._trackingLossGraceMs) {
          // Grace period expired: invalidate history so next detection snaps cleanly
          handState.hasValidHistory = false;
          this._resetMetrics(handState);
        }
      }
    }

    // --- STEP 3: Primary Hand Arbitration (Hysteresis-stabilized) ---
    if (detectedCount === 1) {
      this._primaryHand = assignedHands.left ? 'left' : 'right';
    } else if (detectedCount === 2) {
      // If current primary hand is still visible, maintain it (sticky hysteresis)
      if (!this._primaryHand || !this.hands[this._primaryHand].detected) {
        this._primaryHand = this._primaryPreference;
      }
    } else {
      this._primaryHand = null;
    }

    // --- STEP 4: Synchronize with StateManager ---
    stateManager.updateTwoHandTracking({
      hands: this.hands,
      detectedHandsCount: detectedCount,
      primaryHand: this._primaryHand
    });

    return {
      detectedHandsCount: detectedCount,
      primaryHand: this._primaryHand,
      hands: this.hands
    };
  }

  /**
   * Process synthetic hand landmarks generated during Mouse Fallback mode.
   * Maps synthetic coordinates into the primary hand slot for unified downstream pipeline.
   *
   * @param {Array<THREE.Vector3>} syntheticLandmarks
   * @param {number} handSpeed
   */
  processSynthetic(syntheticLandmarks, handSpeed) {
    const targetSide = this._primaryPreference;
    const handState = this.hands[targetSide];
    const otherSide = targetSide === 'right' ? 'left' : 'right';

    handState.detected = true;
    handState.hasValidHistory = true;
    handState.confidence = 1.0;
    handState.handSpeed = handSpeed;
    handState.wristSpeed = handSpeed;

    for (let i = 0; i < 21; i++) {
      handState.landmarks[i].copy(syntheticLandmarks[i]);
    }

    const wrist = handState.landmarks[0];
    const middleMCP = handState.landmarks[9];
    handState.handSize = Math.max(0.12, dist3(wrist, middleMCP));
    handState.prevWrist.copy(wrist);

    handState.palmCenter.set(0, 0, 0);
    handState.palmCenter.add(handState.landmarks[0]);
    handState.palmCenter.add(handState.landmarks[5]);
    handState.palmCenter.add(handState.landmarks[9]);
    handState.palmCenter.add(handState.landmarks[17]);
    handState.palmCenter.multiplyScalar(0.25);

    let maxR = 0;
    for (let i = 0; i < 21; i++) {
      const r = dist3(handState.landmarks[i], handState.palmCenter);
      if (r > maxR) maxR = r;
    }
    handState.boundingRadius = maxR + 0.35 * handState.handSize;

    // Calculate 3D spatial metrics and biomechanical joint angles for synthetic hand
    this._computeBiomechanicalMetrics(handState);

    this.hands[otherSide].detected = false;
    this.hands[otherSide].hasValidHistory = false;
    this._resetMetrics(this.hands[otherSide]);
    this._primaryHand = targetSide;

    stateManager.updateTwoHandTracking({
      hands: this.hands,
      detectedHandsCount: 1,
      primaryHand: targetSide
    });
  }

  /**
   * Calculate comprehensive 3D spatial metrics and biomechanical joint angles in place.
   * Operates deterministically with zero heap allocations in the 60 FPS animation loop.
   *
   * @private
   * @param {Object} handState - Hand tracking data object (left or right)
   */
  _computeBiomechanicalMetrics(handState) {
    const lm = handState.landmarks;
    const m = handState.metrics;
    const cfg = AppConfig.biomechanics;

    // --- 1. Spatial Positions & Dimensions ---
    m.wristPosition.copy(lm[0]);
    m.palmCenter.copy(handState.palmCenter);
    m.boundingRadius = handState.boundingRadius;
    m.handScale = handState.handSize;
    m.estimatedDepth = handState.palmCenter.z;
    m.handWidth = dist3(lm[5], lm[17]);
    m.handLength = dist3(lm[0], lm[12]);

    // --- 2. Palm Normal & Spatial Orientation ---
    computePalmNormal(lm[0], lm[5], lm[17], handState.label, m.palmNormal);
    computePalmOrientation(lm[0], lm[9], m.palmNormal, m.palmOrientation);

    // --- 3. Biomechanical Joint Angles (Geometric interior angles [0, 180] deg) ---
    const ja = m.jointAngles;
    // Thumb: CMC (0-1-2), MCP (1-2-3), IP (2-3-4)
    ja.thumb.cmc = vectorAngle(lm[0], lm[1], lm[2]);
    ja.thumb.mcp = vectorAngle(lm[1], lm[2], lm[3]);
    ja.thumb.ip  = vectorAngle(lm[2], lm[3], lm[4]);

    // Index: MCP (0-5-6), PIP (5-6-7), DIP (6-7-8)
    ja.index.mcp = vectorAngle(lm[0], lm[5], lm[6]);
    ja.index.pip = vectorAngle(lm[5], lm[6], lm[7]);
    ja.index.dip = vectorAngle(lm[6], lm[7], lm[8]);

    // Middle: MCP (0-9-10), PIP (9-10-11), DIP (10-11-12)
    ja.middle.mcp = vectorAngle(lm[0], lm[9], lm[10]);
    ja.middle.pip = vectorAngle(lm[9], lm[10], lm[11]);
    ja.middle.dip = vectorAngle(lm[10], lm[11], lm[12]);

    // Ring: MCP (0-13-14), PIP (13-14-15), DIP (14-15-16)
    ja.ring.mcp = vectorAngle(lm[0], lm[13], lm[14]);
    ja.ring.pip = vectorAngle(lm[13], lm[14], lm[15]);
    ja.ring.dip = vectorAngle(lm[14], lm[15], lm[16]);

    // Pinky: MCP (0-17-18), PIP (17-18-19), DIP (18-19-20)
    ja.pinky.mcp = vectorAngle(lm[0], lm[17], lm[18]);
    ja.pinky.pip = vectorAngle(lm[17], lm[18], lm[19]);
    ja.pinky.dip = vectorAngle(lm[18], lm[19], lm[20]);

    // --- 4. Anatomical Joint Flexion (Degrees flexed from straight: 180 - angle) ---
    const ff = m.fingerFlexion;
    ff.thumb.cmc = Math.max(0.0, 180.0 - ja.thumb.cmc);
    ff.thumb.mcp = Math.max(0.0, 180.0 - ja.thumb.mcp);
    ff.thumb.ip  = Math.max(0.0, 180.0 - ja.thumb.ip);
    ff.thumb.total = ff.thumb.mcp + ff.thumb.ip;

    ff.index.mcp = Math.max(0.0, 180.0 - ja.index.mcp);
    ff.index.pip = Math.max(0.0, 180.0 - ja.index.pip);
    ff.index.dip = Math.max(0.0, 180.0 - ja.index.dip);
    ff.index.total = ff.index.mcp + ff.index.pip + ff.index.dip;

    ff.middle.mcp = Math.max(0.0, 180.0 - ja.middle.mcp);
    ff.middle.pip = Math.max(0.0, 180.0 - ja.middle.pip);
    ff.middle.dip = Math.max(0.0, 180.0 - ja.middle.dip);
    ff.middle.total = ff.middle.mcp + ff.middle.pip + ff.middle.dip;

    ff.ring.mcp = Math.max(0.0, 180.0 - ja.ring.mcp);
    ff.ring.pip = Math.max(0.0, 180.0 - ja.ring.pip);
    ff.ring.dip = Math.max(0.0, 180.0 - ja.ring.dip);
    ff.ring.total = ff.ring.mcp + ff.ring.pip + ff.ring.dip;

    ff.pinky.mcp = Math.max(0.0, 180.0 - ja.pinky.mcp);
    ff.pinky.pip = Math.max(0.0, 180.0 - ja.pinky.pip);
    ff.pinky.dip = Math.max(0.0, 180.0 - ja.pinky.dip);
    ff.pinky.total = ff.pinky.mcp + ff.pinky.pip + ff.pinky.dip;

    // --- 5. Normalized Finger Curl [0.0 = straight, 1.0 = curled] & Extension ---
    const maxFingerFlex = (cfg && cfg.fingerMaxFlexionDeg) ? cfg.fingerMaxFlexionDeg : 220.0;
    const maxThumbFlex = (cfg && cfg.thumbMaxFlexionDeg) ? cfg.thumbMaxFlexionDeg : 130.0;

    const fc = m.fingerCurl;
    const fe = m.fingerExtension;

    fc.thumb = clamp(ff.thumb.total / maxThumbFlex, 0.0, 1.0);
    fe.thumb = 1.0 - fc.thumb;

    fc.index = clamp(ff.index.total / maxFingerFlex, 0.0, 1.0);
    fe.index = 1.0 - fc.index;

    fc.middle = clamp(ff.middle.total / maxFingerFlex, 0.0, 1.0);
    fe.middle = 1.0 - fc.middle;

    fc.ring = clamp(ff.ring.total / maxFingerFlex, 0.0, 1.0);
    fe.ring = 1.0 - fc.ring;

    fc.pinky = clamp(ff.pinky.total / maxFingerFlex, 0.0, 1.0);
    fe.pinky = 1.0 - fc.pinky;

    // --- 6. Thumb Opposition & Hand Openness ---
    const oppScale = (cfg && cfg.thumbOppositionScale) ? cfg.thumbOppositionScale : 1.3;
    const oppDist = dist3(lm[4], lm[17]);
    const maxOppDist = Math.max(0.01, handState.handSize * oppScale);
    m.thumbOpposition = clamp(1.0 - (oppDist / maxOppDist), 0.0, 1.0);

    m.handOpenness = clamp((fe.thumb + fe.index + fe.middle + fe.ring + fe.pinky) * 0.2, 0.0, 1.0);
  }

  /**
   * Reset metrics to safe neutral defaults
   * @private
   * @param {Object} handState
   */
  _resetMetrics(handState) {
    const m = handState.metrics;
    m.wristPosition.set(0, 0, 0);
    m.palmCenter.set(0, 0, 0);
    m.palmNormal.set(0, 0, 1);
    m.palmOrientation.pitch = 0.0;
    m.palmOrientation.yaw = 0.0;
    m.palmOrientation.roll = 0.0;
    m.handWidth = 0.0;
    m.handLength = 0.0;
    m.handScale = 0.8;
    m.boundingRadius = 1.8;
    m.estimatedDepth = 0.0;
    m.thumbOpposition = 0.0;
    m.handOpenness = 1.0;

    const fingers = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    for (let i = 0; i < 5; i++) {
      const f = fingers[i];
      m.fingerCurl[f] = 0.0;
      m.fingerExtension[f] = 1.0;
      const ja = m.jointAngles[f];
      for (const k in ja) ja[k] = 180.0;
      const ff = m.fingerFlexion[f];
      for (const k in ff) ff[k] = 0.0;
    }
  }

  /**
   * Get specific hand data object ('left' or 'right')
   * @param {'left'|'right'} side
   * @returns {Object}
   */
  getHand(side) {
    return this.hands[side] || null;
  }

  /**
   * Current primary hand side ('left'|'right'|null)
   * @returns {string|null}
   */
  get primaryHand() {
    return this._primaryHand;
  }

  /**
   * Get primary hand data object or null
   * @returns {Object|null}
   */
  getPrimaryHand() {
    return this._primaryHand ? this.hands[this._primaryHand] : null;
  }

  /**
   * Reset tracking histories and grace periods
   */
  reset() {
    for (const side of ['left', 'right']) {
      const h = this.hands[side];
      h.detected = false;
      h.hasValidHistory = false;
      h.confidence = 0.0;
      h.lastSeenTimestamp = 0;
      h.wristSpeed = 0.0;
      h.handSpeed = 0.0;
      this._resetMetrics(h);
    }
    this._primaryHand = null;
  }
}

/**
 * Singleton instance of LandmarkProcessor
 */
export const landmarkProcessor = new LandmarkProcessor();
