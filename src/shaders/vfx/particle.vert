/**
 * PROJECT NEXUS — GPU Particle Engine Vertex Shader
 * Phase 5, Step 5.1: GPU Buffer-Geometry Particle Engine Architecture
 *
 * Capabilities:
 * - High-density GPU vertex displacement & orbital flow simulation
 * - Perspective point-size attenuation with depth clamping
 * - Individual particle size, pulse, phase, and lifetime modulation
 * - Zero CPU-side position recalculations in 60 FPS animation loop
 */

precision highp float;

// Per-particle Buffer Attributes
attribute vec3 aVelocity;
attribute float aPhase;
attribute float aSize;
attribute vec3 aColor;
attribute vec2 aLifetime; // x = age, y = maxLife (reserved for future lifecycle features)

// Global Simulation Uniforms
uniform float uTime;
uniform float uBaseSize;
uniform float uDpr;
uniform float uSpeed;
uniform float uGpuMotion; // 1.0 = simulate on GPU, 0.0 = static base position

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

// Varyings to Fragment Shader
varying vec3 vWorldPos;
varying float vPhase;
varying vec3 vColor;

// Procedural harmonic 3D lissajous orbital mist
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

  // Pulsation & perspective attenuation: size decreases realistically with depth
  float pulsate = 1.0 + 0.18 * sin(uTime * 4.0 + aPhase);
  float pointSize = (uBaseSize * aSize * pulsate * uDpr) / max(0.1, -mvPosition.z);
  gl_PointSize = clamp(pointSize, 1.0, 128.0);

  gl_Position = projectionMatrix * mvPosition;
}
