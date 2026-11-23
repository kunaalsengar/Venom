/**
 * PROJECT NEXUS — Holographic Effects & Procedural Animations
 * Reusable mathematical utilities and procedural oscillation helpers for holographic rendering.
 *
 * Designed with pre-allocated scratch vectors to guarantee zero heap allocations in the 60 FPS loop.
 *
 * @module hologram/HologramEffects
 */

import * as THREE from 'three';

// Pre-allocated scratch objects to prevent allocations in animate loops
const _scratchVec3A = new THREE.Vector3();
const _scratchVec3B = new THREE.Vector3();
const _scratchColorA = new THREE.Color();
const _scratchColorB = new THREE.Color();
const _scratchQuat = new THREE.Quaternion();

export class HologramEffects {
  /**
   * Smooth sine/cosine breathing pulse in range [min, max]
   * @param {number} time - Elapsed time in seconds
   * @param {number} [speed=1.0] - Pulse speed multiplier
   * @param {number} [min=0.0] - Minimum bound
   * @param {number} [max=1.0] - Maximum bound
   * @returns {number}
   */
  static pulse(time, speed = 1.0, min = 0.0, max = 1.0) {
    const norm = 0.5 + 0.5 * Math.sin(time * speed);
    return min + norm * (max - min);
  }

  /**
   * Dual-frequency organic harmonic oscillation
   * @param {number} time
   * @param {number} [baseSpeed=1.0]
   * @param {number} [harmonicRatio=1.618]
   * @returns {number} Value in range [-1.0, 1.0]
   */
  static harmonicWobble(time, baseSpeed = 1.0, harmonicRatio = 1.618) {
    return 0.7 * Math.sin(time * baseSpeed) + 0.3 * Math.sin(time * baseSpeed * harmonicRatio);
  }

  /**
   * Procedural horizontal scanline factor at vertical coordinate y
   * @param {number} y - World or screen Y position
   * @param {number} time - Elapsed time
   * @param {number} [freq=20.0] - Scanline density
   * @param {number} [speed=2.0] - Movement speed
   * @returns {number} Value in range [0.75, 1.0]
   */
  static scanline(y, time, freq = 20.0, speed = 2.0) {
    return 0.85 + 0.15 * Math.sin(y * freq + time * speed);
  }

  /**
   * Calculate Fresnel rim coefficient between surface normal and view direction
   * @param {THREE.Vector3} normal - Normalized surface normal
   * @param {THREE.Vector3} viewDir - Normalized camera view direction
   * @param {number} [power=2.5] - Fresnel sharpness power
   * @returns {number} Normalized rim factor [0.0 - 1.0]
   */
  static fresnel(normal, viewDir, power = 2.5) {
    const dotNV = Math.max(0.0, normal.dot(viewDir));
    return Math.pow(1.0 - dotNV, power);
  }

  /**
   * Smoothly interpolate between two hex color values without garbage collection
   * @param {number} hexA
   * @param {number} hexB
   * @param {number} t - Interpolation alpha [0.0 - 1.0]
   * @param {THREE.Color} outColor - Target color instance
   * @returns {THREE.Color}
   */
  static lerpColor(hexA, hexB, t, outColor) {
    _scratchColorA.setHex(hexA);
    _scratchColorB.setHex(hexB);
    outColor.copy(_scratchColorA).lerp(_scratchColorB, THREE.MathUtils.clamp(t, 0.0, 1.0));
    return outColor;
  }

  /**
   * Jitter displacement vector for holographic glitch / instability effects
   * @param {number} time
   * @param {number} intensity - Amplitude in world units
   * @param {THREE.Vector3} outVec - Output vector
   * @returns {THREE.Vector3}
   */
  static glitchOffset(time, intensity, outVec) {
    // High-frequency pseudo-random threshold
    const spike = Math.sin(time * 33.0) * Math.cos(time * 19.0);
    if (Math.abs(spike) > 0.88) {
      outVec.set(
        Math.sin(time * 80.0) * intensity,
        Math.cos(time * 75.0) * intensity * 0.4,
        0.0
      );
    } else {
      outVec.set(0, 0, 0);
    }
    return outVec;
  }
}
