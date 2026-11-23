/**
 * PROJECT NEXUS — Mathematical Utilities
 * Pure spatial transformation and calculation helpers for 3D gesture tracking.
 *
 * @module utils/MathUtils
 */

import * as THREE from 'three';

/**
 * 3D Euclidean distance between two points with x, y, z components
 * @param {{x: number, y: number, z: number}} a
 * @param {{x: number, y: number, z: number}} b
 * @returns {number} Distance
 */
export function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Clamp a numeric value between min and max bounds
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number} Clamped value
 */
export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/**
 * Linear interpolation between a and b
 * @param {number} a
 * @param {number} b
 * @param {number} t - Interpolation factor [0, 1]
 * @returns {number} Interpolated value
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Compute exponential decay alpha coefficient for delta time: alpha = 1 - exp(-lambda * dt)
 * Guarantees frame-rate independent smoothing.
 * @param {number} lambda - Rate coefficient
 * @param {number} dt - Delta time in seconds
 * @returns {number} Alpha in range [0, 1]
 */
export function expDecayAlpha(lambda, dt) {
  return 1.0 - Math.exp(-lambda * dt);
}

/**
 * Compute perspective camera frustum dimensions (width and height) at a specific world Z plane
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} depthZ - Target world Z coordinate
 * @returns {{width: number, height: number}}
 */
export function getFrustumSizeAt(camera, depthZ) {
  const dist = camera.position.z - depthZ;
  const height = 2.0 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const width = height * camera.aspect;
  return { width, height };
}

/**
 * Map normalized MediaPipe screen coordinates (u, v, z) into Three.js 3D world space
 * Note: u coordinate is already horizontally mirrored (u = 1.0 - landmark.x)
 * Optimized for zero allocations in high-frequency 60 FPS animation loops.
 *
 * @param {number} u - Mirrored horizontal coordinate in [0, 1]
 * @param {number} v - Vertical coordinate in [0, 1]
 * @param {number} [zNorm=0] - Depth estimate from MediaPipe
 * @param {THREE.PerspectiveCamera} camera - Three.js scene camera
 * @param {THREE.Vector3} outVec - Output Vector3 target to prevent allocation
 * @returns {THREE.Vector3} outVec
 */
export function screenToWorld(u, v, zNorm, camera, outVec) {
  const worldZ = (zNorm !== undefined ? -zNorm * 1.8 : 0);
  const dist = camera.position.z - worldZ;
  const fHeight = 2.0 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const fWidth = fHeight * camera.aspect;
  outVec.x = (u - 0.5) * fWidth;
  outVec.y = (0.5 - v) * fHeight;
  outVec.z = worldZ;
  return outVec;
}

/**
 * Compute the 3D interior angle at vertex B formed by segments BA and BC in degrees.
 * Returns finite angle in range [0, 180]. Handles degenerate zero-length vectors safely.
 * Zero memory allocations.
 *
 * @param {{x: number, y: number, z: number}} a - Point A
 * @param {{x: number, y: number, z: number}} b - Joint vertex B
 * @param {{x: number, y: number, z: number}} c - Point C
 * @returns {number} Angle at B in degrees [0, 180]
 */
export function vectorAngle(a, b, c) {
  const abX = a.x - b.x;
  const abY = a.y - b.y;
  const abZ = a.z - b.z;
  const cbX = c.x - b.x;
  const cbY = c.y - b.y;
  const cbZ = c.z - b.z;

  const lenAB = Math.hypot(abX, abY, abZ);
  const lenCB = Math.hypot(cbX, cbY, cbZ);

  if (lenAB < 1e-6 || lenCB < 1e-6) {
    return 180.0;
  }

  const dot = (abX * cbX + abY * cbY + abZ * cbZ) / (lenAB * lenCB);
  const clampedDot = Math.min(Math.max(dot, -1.0), 1.0);
  return Math.acos(clampedDot) * (180.0 / Math.PI);
}

/**
 * Calculate the normalized outward-facing palmar normal vector.
 * In mirrored viewport coordinates, accounts for handedness so that the palmar normal
 * consistently points towards the camera (+Z) when the palm faces forward.
 *
 * @param {{x: number, y: number, z: number}} wrist - Landmark 0
 * @param {{x: number, y: number, z: number}} indexMCP - Landmark 5
 * @param {{x: number, y: number, z: number}} pinkyMCP - Landmark 17
 * @param {'left'|'right'} handedness - Hand label
 * @param {THREE.Vector3} outVec - Output vector mutated in place
 * @returns {THREE.Vector3} outVec
 */
export function computePalmNormal(wrist, indexMCP, pinkyMCP, handedness, outVec) {
  const ux = indexMCP.x - wrist.x;
  const uy = indexMCP.y - wrist.y;
  const uz = indexMCP.z - wrist.z;

  const vx = pinkyMCP.x - wrist.x;
  const vy = pinkyMCP.y - wrist.y;
  const vz = pinkyMCP.z - wrist.z;

  const isRight = (handedness || '').toLowerCase() === 'right';
  let nx, ny, nz;

  if (isRight) {
    // For right hand in mirrored camera space: v x u points outward (+Z)
    nx = vy * uz - vz * uy;
    ny = vz * ux - vx * uz;
    nz = vx * uy - vy * ux;
  } else {
    // For left hand in mirrored camera space: u x v points outward (+Z)
    nx = uy * vz - uz * vy;
    ny = uz * vx - ux * vz;
    nz = ux * vy - uy * vx;
  }

  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-6) {
    outVec.set(0, 0, 1);
  } else {
    outVec.set(nx / len, ny / len, nz / len);
  }
  return outVec;
}

/**
 * Compute palm spatial orientation Euler angles (pitch, yaw, roll) in degrees.
 * Evaluates hand pointing axis (Wrist -> Middle MCP) and palm normal.
 *
 * @param {{x: number, y: number, z: number}} wrist - Landmark 0
 * @param {{x: number, y: number, z: number}} middleMCP - Landmark 9
 * @param {THREE.Vector3} palmNormal - Outward normal vector
 * @param {{pitch: number, yaw: number, roll: number}} outOrientation - Mutated in place
 * @returns {{pitch: number, yaw: number, roll: number}} outOrientation
 */
export function computePalmOrientation(wrist, middleMCP, palmNormal, outOrientation) {
  const fx = middleMCP.x - wrist.x;
  const fy = middleMCP.y - wrist.y;
  const fz = middleMCP.z - wrist.z;
  const fLen = Math.hypot(fx, fy, fz);

  let pitch = 0;
  let yaw = 0;
  let roll = 0;

  if (fLen > 1e-6) {
    const invFLen = 1.0 / fLen;
    const fDirX = fx * invFLen;
    const fDirY = fy * invFLen;
    const fDirZ = fz * invFLen;

    // Pitch: elevation angle above/below horizontal plane [-90, +90] deg
    pitch = Math.asin(Math.min(Math.max(fDirY, -1.0), 1.0)) * (180.0 / Math.PI);

    // Yaw: azimuthal angle in horizontal plane [-180, +180] deg
    yaw = Math.atan2(fDirX, -fDirZ) * (180.0 / Math.PI);

    // Roll: rotation about pointing axis using palm normal
    const rx = fDirY * palmNormal.z - fDirZ * palmNormal.y;
    const ry = fDirZ * palmNormal.x - fDirX * palmNormal.z;
    const rz = fDirX * palmNormal.y - fDirY * palmNormal.x;
    const rLen = Math.hypot(rx, ry, rz);

    if (rLen > 1e-6) {
      roll = Math.atan2(ry, rx) * (180.0 / Math.PI);
    }
  }

  outOrientation.pitch = Number.isFinite(pitch) ? pitch : 0;
  outOrientation.yaw = Number.isFinite(yaw) ? yaw : 0;
  outOrientation.roll = Number.isFinite(roll) ? roll : 0;
  return outOrientation;
}

/**
 * Factory for a pre-allocated hand biomechanical metrics structure.
 * Guarantees zero heap allocations during runtime 60 FPS updates.
 *
 * @returns {Object} Pre-allocated hand metrics container
 */
export function createHandMetrics() {
  return {
    wristPosition: new THREE.Vector3(0, 0, 0),
    palmCenter: new THREE.Vector3(0, 0, 0),
    palmNormal: new THREE.Vector3(0, 0, 1),
    palmOrientation: { pitch: 0.0, yaw: 0.0, roll: 0.0 },
    handWidth: 0.0,
    handLength: 0.0,
    handScale: 0.8,
    boundingRadius: 1.8,
    estimatedDepth: 0.0,

    jointAngles: {
      thumb: { cmc: 180.0, mcp: 180.0, ip: 180.0 },
      index: { mcp: 180.0, pip: 180.0, dip: 180.0 },
      middle: { mcp: 180.0, pip: 180.0, dip: 180.0 },
      ring: { mcp: 180.0, pip: 180.0, dip: 180.0 },
      pinky: { mcp: 180.0, pip: 180.0, dip: 180.0 }
    },

    fingerFlexion: {
      thumb: { cmc: 0.0, mcp: 0.0, ip: 0.0, total: 0.0 },
      index: { mcp: 0.0, pip: 0.0, dip: 0.0, total: 0.0 },
      middle: { mcp: 0.0, pip: 0.0, dip: 0.0, total: 0.0 },
      ring: { mcp: 0.0, pip: 0.0, dip: 0.0, total: 0.0 },
      pinky: { mcp: 0.0, pip: 0.0, dip: 0.0, total: 0.0 }
    },

    fingerCurl: {
      thumb: 0.0,
      index: 0.0,
      middle: 0.0,
      ring: 0.0,
      pinky: 0.0
    },

    fingerExtension: {
      thumb: 1.0,
      index: 1.0,
      middle: 1.0,
      ring: 1.0,
      pinky: 1.0
    },

    thumbOpposition: 0.0,
    handOpenness: 1.0
  };
}

/**
 * Deep in-place copy of hand biomechanical metrics from src to dst.
 * Operates without allocating any new objects or vectors.
 *
 * @param {Object} src
 * @param {Object} dst
 */
export function copyMetrics(src, dst) {
  if (!src || !dst) return;
  dst.wristPosition.copy(src.wristPosition);
  dst.palmCenter.copy(src.palmCenter);
  dst.palmNormal.copy(src.palmNormal);
  dst.palmOrientation.pitch = src.palmOrientation.pitch;
  dst.palmOrientation.yaw = src.palmOrientation.yaw;
  dst.palmOrientation.roll = src.palmOrientation.roll;
  dst.handWidth = src.handWidth;
  dst.handLength = src.handLength;
  dst.handScale = src.handScale;
  dst.boundingRadius = src.boundingRadius;
  dst.estimatedDepth = src.estimatedDepth;
  dst.thumbOpposition = src.thumbOpposition;
  dst.handOpenness = src.handOpenness;

  const fingers = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  for (let f = 0; f < 5; f++) {
    const fn = fingers[f];
    dst.fingerCurl[fn] = src.fingerCurl[fn];
    dst.fingerExtension[fn] = src.fingerExtension[fn];

    const sJA = src.jointAngles[fn];
    const dJA = dst.jointAngles[fn];
    for (const j in sJA) {
      dJA[j] = sJA[j];
    }

    const sFF = src.fingerFlexion[fn];
    const dFF = dst.fingerFlexion[fn];
    for (const j in sFF) {
      dFF[j] = sFF[j];
    }
  }
}
