/**
 * PROJECT NEXUS — Particle Shaders & Materials Module
 * Encapsulated GLSL shader programs and material factory for GPU Particle Engine.
 *
 * @module particles/ParticleShaders
 */

import * as THREE from 'three';
import { AppConfig } from '../config/AppConfig.js';

export const ParticleVertexShader = /* glsl */ `
precision highp float;

attribute vec3 aVelocity;
attribute float aPhase;
attribute float aSize;
attribute vec3 aColor;
attribute vec2 aLifetime;

uniform float uTime;
uniform float uBaseSize;
uniform float uDpr;
uniform float uSpeed;
uniform float uGpuMotion;

// Dual-Hand Force Field Uniforms (Phase 5, Steps 5.2 & 5.3)
// Force Field 1 (Primary / Right Hand / Manual API)
uniform vec3 uForcePosition;
uniform float uForceRadius;
uniform float uForceStrength;
uniform float uForceFalloff;
uniform float uForceMaxDist;
uniform float uForceType;   // +1.0 = attract, -1.0 = repel, 0.0 = none
uniform float uForceWeight; // [0.0, 1.0] smooth transition weight

// Force Field 2 (Secondary / Left Hand)
uniform vec3 uForce2Position;
uniform float uForce2Radius;
uniform float uForce2Strength;
uniform float uForce2Falloff;
uniform float uForce2MaxDist;
uniform float uForce2Type;   // +1.0 = attract, -1.0 = repel, 0.0 = none
uniform float uForce2Weight; // [0.0, 1.0] smooth transition weight

varying vec3 vWorldPos;
varying float vPhase;
varying vec3 vColor;

vec3 computeGpuOrbitalMotion(vec3 basePos, vec3 velocity, float phase, float t) {
  float omega = phase + t * (0.65 * uSpeed);
  float rad = 0.85 * (0.65 + 0.35 * sin(t * 1.4 + phase));
  
  vec3 orbit = vec3(
    cos(omega) * rad,
    sin(omega) * rad,
    cos(omega * 2.0) * (rad * 0.45)
  );

  vec3 drift = velocity * (sin(t * 1.8 + phase) * 0.12);
  return basePos + orbit * 0.35 + drift;
}

// Configurable Attraction & Repulsion Force Field (Phase 5, Steps 5.2 & 5.3)
vec3 computeSingleForceDisplacement(vec3 p, vec3 center, float radius, float strength, float falloffExp, float maxDist, float forceType, float weight) {
  if (abs(forceType) < 0.01 || weight < 0.001 || radius <= 0.001) {
    return vec3(0.0);
  }

  vec3 toCenter = center - p;
  float dist = length(toCenter);
  if (dist >= radius) {
    return vec3(0.0);
  }

  // Normalized distance [0.0 at center, 1.0 at boundary]
  float normDist = dist / radius;

  // Continuous falloff curve: 1.0 at center, smoothly decaying to 0.0 at boundary
  float falloff = pow(clamp(1.0 - normDist, 0.0, 1.0), falloffExp);

  // Normalized direction with epsilon preventing division-by-zero or explosion near center
  vec3 dir = toCenter / max(0.02, dist);

  vec3 displacement = vec3(0.0);
  if (forceType > 0.5) {
    // Attraction: move toward center, bounded so particles never overshoot center
    float pull = min(dist, strength * falloff);
    pull = min(pull, maxDist);
    displacement = dir * pull;
  } else if (forceType < -0.5) {
    // Repulsion: push away from center, smooth and stable near center
    float push = min(strength * falloff, maxDist);
    displacement = -dir * push;
  }

  return displacement * weight;
}

// Backward-compatible helper for single force field
vec3 computeForceDisplacement(vec3 p) {
  return computeSingleForceDisplacement(p, uForcePosition, uForceRadius, uForceStrength, uForceFalloff, uForceMaxDist, uForceType, uForceWeight);
}

void main() {
  vPhase = aPhase;
  vColor = aColor;

  // Evaluate base 3D position (GPU procedural motion or base position)
  vec3 baseMotionPos = mix(position, computeGpuOrbitalMotion(position, aVelocity, aPhase, uTime), uGpuMotion);
  
  // Apply Dual-Hand GPU Force Fields (Attraction / Repulsion) — Phase 5, Steps 5.2 & 5.3
  vec3 disp1 = computeSingleForceDisplacement(baseMotionPos, uForcePosition, uForceRadius, uForceStrength, uForceFalloff, uForceMaxDist, uForceType, uForceWeight);
  vec3 disp2 = computeSingleForceDisplacement(baseMotionPos, uForce2Position, uForce2Radius, uForce2Strength, uForce2Falloff, uForce2MaxDist, uForce2Type, uForce2Weight);
  vec3 totalDisp = disp1 + disp2;
  float maxAllowed = max(uForceMaxDist, uForce2MaxDist);
  float dispLen = length(totalDisp);
  if (dispLen > maxAllowed && dispLen > 0.0001) {
    totalDisp = (totalDisp / dispLen) * maxAllowed;
  }
  vec3 pos = baseMotionPos + totalDisp;
  
  vec4 worldPos4 = modelMatrix * vec4(pos, 1.0);
  vWorldPos = worldPos4.xyz;

  vec4 mvPosition = viewMatrix * worldPos4;

  float pulsate = 1.0 + 0.18 * sin(uTime * 4.0 + aPhase);
  float pointSize = (uBaseSize * aSize * pulsate * uDpr) / max(0.1, -mvPosition.z);
  gl_PointSize = clamp(pointSize, 1.0, 128.0);

  gl_Position = projectionMatrix * mvPosition;
}
`;

export const ParticleFragmentShader = /* glsl */ `
precision highp float;

uniform vec3 uLightDir;
uniform float uTime;
uniform float uOpacity;
uniform vec3 uBaseColor;
uniform vec3 uSpecularColor;
uniform vec3 uRimColor;

varying vec3 vWorldPos;
varying float vPhase;
varying vec3 vColor;

void main() {
  vec2 coord = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(coord, coord);
  if (r2 > 1.0) discard;

  float z = sqrt(max(0.0, 1.0 - r2));
  vec3 N = normalize(vec3(coord.x, -coord.y, z));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(uLightDir + V);

  float specSharp = pow(max(0.0, dot(N, H)), 32.0) * 1.1;
  float rim = pow(1.0 - N.z, 3.2) * 0.75;

  vec3 base = mix(uBaseColor, vColor, 0.25);
  vec3 col = base + specSharp * uSpecularColor + rim * uRimColor;

  float alpha = (1.0 - smoothstep(0.80, 1.0, r2)) * uOpacity;
  gl_FragColor = vec4(col, alpha);
}
`;

export class ParticleShaders {
  /**
   * Create an optimized GPU particle shader material
   * @param {Object} [options]
   * @returns {THREE.ShaderMaterial}
   */
  static createMaterial(options = {}) {
    const cfg = AppConfig.particles || {};
    const lightDir = (cfg.lighting && cfg.lighting.direction) ? cfg.lighting.direction : [-0.45, 0.75, 0.48];
    const lightVec = new THREE.Vector3(lightDir[0], lightDir[1], lightDir[2]).normalize();

    const baseColorHex = cfg.colors?.base !== undefined ? cfg.colors.base : 0x050a14;
    const specColorHex = cfg.colors?.specular !== undefined ? cfg.colors.specular : 0xf0f8ff;
    const rimColorHex = cfg.colors?.rim !== undefined ? cfg.colors.rim : 0x00f0ff;

    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: ParticleVertexShader,
      fragmentShader: ParticleFragmentShader,
      uniforms: {
        uTime: { value: 0.0 },
        uBaseSize: { value: options.baseSize || cfg.baseSize || 11.0 },
        uDpr: { value: options.dpr || (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1) },
        uSpeed: { value: options.speed || cfg.speed || 1.0 },
        uGpuMotion: { value: options.gpuMotion !== false ? 1.0 : 0.0 },
        uOpacity: { value: options.opacity !== undefined ? options.opacity : (cfg.opacity || 0.92) },
        uLightDir: { value: lightVec },
        uBaseColor: { value: new THREE.Color(baseColorHex) },
        uSpecularColor: { value: new THREE.Color(specColorHex) },
        uRimColor: { value: new THREE.Color(rimColorHex) },
        // Force Field Uniforms (Phase 5, Step 5.2 & 5.3)
        // Force Field 1 (Primary / Right Hand / Manual API)
        uForcePosition: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
        uForceRadius: { value: cfg.forceField?.radius || 2.20 },
        uForceStrength: { value: 0.0 },
        uForceFalloff: { value: cfg.forceField?.falloff || 2.0 },
        uForceMaxDist: { value: cfg.forceField?.maxDisplacement || 2.50 },
        uForceType: { value: 0.0 }, // +1.0 = attract, -1.0 = repel, 0.0 = none
        uForceWeight: { value: 0.0 }, // 0.0 = inactive, 1.0 = fully active
        // Force Field 2 (Secondary / Left Hand)
        uForce2Position: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
        uForce2Radius: { value: cfg.handInteraction?.radius || cfg.forceField?.radius || 2.20 },
        uForce2Strength: { value: 0.0 },
        uForce2Falloff: { value: cfg.handInteraction?.falloff || cfg.forceField?.falloff || 2.0 },
        uForce2MaxDist: { value: cfg.handInteraction?.maxDisplacement || cfg.forceField?.maxDisplacement || 2.50 },
        uForce2Type: { value: 0.0 },
        uForce2Weight: { value: 0.0 }
      }
    });
  }
}
