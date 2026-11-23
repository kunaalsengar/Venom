/**
 * PROJECT NEXUS — 3D Holographic Interaction Cursor
 * Independent visual 3D reticle providing real-time gestural and spatial feedback.
 *
 * Features:
 * - Hand-specific holographic color coding (Electric Cyan for Right, Violet/Purple for Left).
 * - Multi-layer geometry: inner focal target, outer segmented reticle ring, and cardinal crosshairs.
 * - Dynamic gesture responsiveness:
 *   - PINCH: Smooth contraction toward focal center with brightening highlight.
 *   - OPEN PALM: Gentle radial expansion indicating free hover state.
 *   - FIST: Compact armor bracket profile.
 * - Graceful fade-in on acquisition and smooth decay on tracking loss.
 * - Zero heap allocations in per-frame animation loops.
 *
 * @module hologram/HologramCursor
 */

import * as THREE from 'three';
import { HologramObject } from './HologramObject.js';
import { HologramMaterials } from './HologramMaterials.js';
import { AppConfig } from '../config/AppConfig.js';
import { expDecayAlpha, clamp } from '../utils/MathUtils.js';

export class HologramCursor extends HologramObject {
  /**
   * @param {'left'|'right'} side
   * @param {Object} [options]
   */
  constructor(side = 'right', options = {}) {
    super(`cursor_${side}`);

    this.side = side;
    this._cfg = Object.assign({}, AppConfig.interaction.cursor, options);

    // Primary hand color
    const isRight = side === 'right';
    this._primaryColor = isRight ? this._cfg.colors.right : this._cfg.colors.left;
    this._pinchColor = this._cfg.colors.pinchGlow || 0x38bdf8;
    this._fistColor = this._cfg.colors.fistGlow || 0xff4466;

    // Tracking & gestural animation state
    this._isTracked = false;
    this._confidence = 0.0;
    this._gesture = 'IDLE';
    this._isPinching = false;
    this._pinchDistance = 1.0;

    // Dynamic scale and opacity interpolation
    this._currentScale = 1.0;
    this._targetScale = 1.0;
    this._currentOpacity = 0.0;
    this._targetOpacity = 0.0;
    this._rotationAngle = 0.0;

    this._buildCursorGeometry();
  }

  /**
   * Construct 3D reticle rings, center dot, and cardinal tick crosshairs
   * @private
   */
  _buildCursorGeometry() {
    const r = this._cfg.reticleRadius || 0.065;
    const dotR = this._cfg.innerDotRadius || 0.012;

    // 1. Center Focal Dot / Ring
    const innerGeo = new THREE.RingGeometry(dotR * 0.4, dotR, 24);
    this._innerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this._primaryColor),
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.trackMaterial(this._innerMat);
    this._innerMesh = new THREE.Mesh(innerGeo, this._innerMat);
    this._innerMesh.frustumCulled = false;
    this.add(this._innerMesh);

    // 2. Rotating Outer Reticle Ring
    this._reticleGroup = new THREE.Group();

    const outerGeo = new THREE.TorusGeometry(r, 0.003, 6, 48);
    this._outerMat = HologramMaterials.createRingShaderMaterial({
      color: this._primaryColor,
      opacity: 0.0
    });
    this._outerMat.uniforms.uDashFrequency.value = 16.0;
    this.trackMaterial(this._outerMat);

    this._outerMesh = new THREE.Mesh(outerGeo, this._outerMat);
    this._outerMesh.frustumCulled = false;
    this._reticleGroup.add(this._outerMesh);

    // 3. Cardinal Crosshair Ticks (Top, Bottom, Left, Right)
    const tickLen = 0.018;
    const tickVertices = [];

    // Right & Left ticks
    tickVertices.push(r - tickLen * 0.5, 0, 0, r + tickLen * 0.5, 0, 0);
    tickVertices.push(-r - tickLen * 0.5, 0, 0, -r + tickLen * 0.5, 0, 0);

    // Top & Bottom ticks
    tickVertices.push(0, r - tickLen * 0.5, 0, 0, r + tickLen * 0.5, 0);
    tickVertices.push(0, -r - tickLen * 0.5, 0, 0, -r + tickLen * 0.5, 0);

    const tickGeo = new THREE.BufferGeometry();
    tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(tickVertices, 3));

    this._tickMat = HologramMaterials.createLineMaterial({
      color: this._primaryColor,
      opacity: 0.0
    });
    this.trackMaterial(this._tickMat);

    this._tickLines = new THREE.LineSegments(tickGeo, this._tickMat);
    this._tickLines.frustumCulled = false;
    this._reticleGroup.add(this._tickLines);

    this.add(this._reticleGroup);

    // Start initially hidden
    this.visible = false;
    this.opacity = 0.0;
  }

  /**
   * Update tracking and gestural state for the cursor
   * @param {boolean} isTracked - Whether hand is currently tracked
   * @param {number} confidence - Tracking confidence [0.0 - 1.0]
   * @param {string} gesture - 'IDLE'|'OPEN'|'FIST'|'PINCH'|'SPREAD'
   * @param {boolean} isPinching - Pinch gesture active flag
   * @param {number} pinchDistance - Normalized pinch distance ratio
   */
  setTrackingState(isTracked, confidence = 1.0, gesture = 'IDLE', isPinching = false, pinchDistance = 1.0) {
    this._isTracked = Boolean(isTracked);
    this._confidence = confidence;
    this._gesture = gesture;
    this._isPinching = isPinching;
    this._pinchDistance = pinchDistance;

    if (this._isTracked) {
      this._targetOpacity = this._cfg.baseOpacity * clamp(confidence, 0.3, 1.0);

      // Determine target scale based on active gesture
      if (this._isPinching || gesture === 'PINCH') {
        this._targetScale = this._cfg.pinchContractScale;
      } else if (gesture === 'OPEN' || gesture === 'SPREAD') {
        this._targetScale = this._cfg.openExpandScale;
      } else if (gesture === 'FIST') {
        this._targetScale = this._cfg.fistContractScale;
      } else {
        this._targetScale = 1.0;
      }
    } else {
      this._targetOpacity = 0.0;
      this._targetScale = 1.0;
    }
  }

  /**
   * Per-frame animation update (Zero heap allocations)
   * @param {number} time - Elapsed time in seconds
   * @param {number} dt - Frame delta time in seconds
   */
  update(time, dt) {
    const fadeSpeed = this._cfg.lossFadeSpeed || 9.0;
    const fadeAlpha = expDecayAlpha(fadeSpeed, dt);
    const scaleAlpha = expDecayAlpha(18.0, dt);

    // Smooth opacity interpolation
    this._currentOpacity += (this._targetOpacity - this._currentOpacity) * fadeAlpha;

    if (this._currentOpacity < 0.005) {
      if (this.visible) this.visible = false;
      return;
    }

    if (!this.visible) this.visible = true;
    this.opacity = this._currentOpacity;

    // Smooth scale interpolation
    this._currentScale += (this._targetScale - this._currentScale) * scaleAlpha;
    this.scale.set(this._currentScale, this._currentScale, this._currentScale);

    // Continuous slow reticle rotation
    this._rotationAngle += 1.4 * dt;
    this._reticleGroup.rotation.z = this._rotationAngle;

    // Subtle breathing pulse on outer ring
    if (this._outerMat.uniforms) {
      this._outerMat.uniforms.uTime.value = time;
      this._outerMat.uniforms.uPulse.value = 0.85 + 0.15 * Math.sin(time * this._cfg.pulseSpeed);
      this._outerMat.uniforms.uOpacity.value = this._currentOpacity;
    }

    super.update(time, dt);
  }
}
