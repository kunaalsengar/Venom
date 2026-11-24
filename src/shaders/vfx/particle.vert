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

// Dual-Hand & Manual Force Field Uniforms (Phase 5, Steps 5.2 & 5.3)
// Force Field 1 (Manual API - Phase 5, Step 5.2)
uniform vec3 uForcePosition;
uniform float uForceRadius;
uniform float uForceStrength;
uniform float uForceFalloff;
uniform float uForceMaxDist;
uniform float uForceType;   // +1.0 = attract, -1.0 = repel, 0.0 = none
uniform float uForceWeight; // [0.0, 1.0] smooth transition weight

// Force Field 2 (Left Hand - Phase 5, Step 5.3)
uniform vec3 uForce2Position;
uniform float uForce2Radius;
uniform float uForce2Strength;
uniform float uForce2Falloff;
uniform float uForce2MaxDist;
uniform float uForce2Type;   // +1.0 = attract, -1.0 = repel, 0.0 = none
uniform float uForce2Weight; // [0.0, 1.0] smooth transition weight

// Force Field 3 (Right Hand - Phase 5, Step 5.3)
uniform vec3 uForce3Position;
uniform float uForce3Radius;
uniform float uForce3Strength;
uniform float uForce3Falloff;
uniform float uForce3MaxDist;
uniform float uForce3Type;   // +1.0 = attract, -1.0 = repel, 0.0 = none
uniform float uForce3Weight; // [0.0, 1.0] smooth transition weight

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

// Configurable Cinematic Attraction Vortex & Repulsion Kinetic Wave Force Field (Phase 5, Step 5.3 - Stage 1)
vec3 computeSingleForceDisplacement(vec3 p, vec3 center, float radius, float strength, float falloffExp, float maxDist, float forceType, float weight, float time, float phase) {
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

  // Normalized direction toward center with epsilon preventing division-by-zero
  vec3 dir = toCenter / max(0.02, dist);

  // Orthonormal tangent basis perpendicular to radial direction 'dir'
  // Avoid collinear singularity with z-axis by branching on abs(dir.z)
  vec3 refAxis = abs(dir.z) < 0.92 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vec3 tangent = cross(dir, refAxis);
  float tanLen = length(tangent);
  tangent = tanLen > 0.001 ? tangent / tanLen : vec3(1.0, 0.0, 0.0);
  vec3 bitangent = cross(dir, tangent);

  vec3 displacement = vec3(0.0);
  if (forceType > 0.5) {
    // -------------------------------------------------------------
    // Implementation A: Cinematic Attraction Gravitational Vortex
    // -------------------------------------------------------------
    // 1. Inward radial pull: bounded so particles cannot overshoot center
    float pull = min(dist, strength * falloff);
    pull = min(pull, maxDist);

    // 2. Differential spiral swirl angle: inner particles wind faster than outer
    //    Continuous time rotation ensures particles swirl even when hand is stationary
    float swirlAngle = time * 2.2 + phase * 1.5 + (1.0 - normDist) * 3.14159;

    // 3. Elliptical 3D orbital displacement on perpendicular tangent plane
    vec3 swirlDir = tangent * cos(swirlAngle) + bitangent * (sin(swirlAngle) * 0.35);

    // 4. Swirl intensity envelope: (normDist * falloff) vanishes smoothly at BOTH:
    //    - center (normDist -> 0.0, eliminating infinite spin singularity at finger core)
    //    - boundary (normDist -> 1.0, where falloff -> 0.0, eliminating seam jumps)
    float swirlIntensity = (normDist * falloff) * (strength * 0.45);
    swirlIntensity = min(swirlIntensity, maxDist * 0.40);

    displacement = dir * pull + swirlDir * swirlIntensity;

  } else if (forceType < -0.5) {
    // -------------------------------------------------------------
    // Implementation B: Kinetic Repulsion Propagating Harmonic Waves
    // -------------------------------------------------------------
    // 1. Base outward radial push: smooth and bounded
    float push = min(strength * falloff, maxDist);

    // 2. Outward-propagating harmonic wave phase (k*r - omega*t)
    //    Wave crests continuously travel outward from hand position
    float wavePhase = normDist * 12.0 - time * 5.0 + phase * 0.8;

    // 3. Strictly positive wave modulation [0.72 to 1.28]:
    //    Guarantees outward push NEVER reverses or pulls backward
    float waveFactor = 1.0 + 0.28 * sin(wavePhase);

    // 4. Subtle organic lateral dispersion along tangent plane (tapers to 0 at boundary via push)
    float turbPhase = normDist * 8.0 - time * 3.5 + phase * 1.4;
    vec3 lateralDisp = tangent * (sin(turbPhase) * 0.12 * push) + bitangent * (cos(turbPhase * 0.7) * 0.08 * push);

    displacement = -dir * (push * waveFactor) + lateralDisp;
  }

  // Safety clamp to guarantee displacement never exceeds maxDist
  float dispLen = length(displacement);
  if (dispLen > maxDist && dispLen > 0.0001) {
    displacement = (displacement / dispLen) * maxDist;
  }

  return displacement * weight;
}

// Backward-compatible helper for single force field
vec3 computeForceDisplacement(vec3 p) {
  return computeSingleForceDisplacement(p, uForcePosition, uForceRadius, uForceStrength, uForceFalloff, uForceMaxDist, uForceType, uForceWeight, uTime, aPhase);
}

void main() {
  vPhase = aPhase;
  vColor = aColor;

  // Evaluate base 3D position (GPU procedural motion or base position)
  vec3 baseMotionPos = mix(position, computeGpuOrbitalMotion(position, aVelocity, aPhase, uTime), uGpuMotion);
  
  // Apply Dual-Hand & Manual GPU Force Fields (Attraction / Repulsion) — Phase 5, Steps 5.2 & 5.3
  vec3 dispManual = computeSingleForceDisplacement(baseMotionPos, uForcePosition, uForceRadius, uForceStrength, uForceFalloff, uForceMaxDist, uForceType, uForceWeight, uTime, aPhase);
  vec3 dispLeft   = computeSingleForceDisplacement(baseMotionPos, uForce2Position, uForce2Radius, uForce2Strength, uForce2Falloff, uForce2MaxDist, uForce2Type, uForce2Weight, uTime, aPhase);
  vec3 dispRight  = computeSingleForceDisplacement(baseMotionPos, uForce3Position, uForce3Radius, uForce3Strength, uForce3Falloff, uForce3MaxDist, uForce3Type, uForce3Weight, uTime, aPhase);
  vec3 totalDisp = dispManual + dispLeft + dispRight;
  float maxAllowed = max(uForceMaxDist, max(uForce2MaxDist, uForce3MaxDist));
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
