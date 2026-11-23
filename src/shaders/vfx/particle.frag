/**
 * PROJECT NEXUS — GPU Particle Engine Fragment Shader
 * Phase 5, Step 5.1: GPU Buffer-Geometry Particle Engine Architecture
 *
 * Capabilities:
 * - Liquid spherical droplet normal reconstruction from gl_PointCoord
 * - High-specular glint (power 32.0) matching JARVIS holographic aesthetic
 * - Luminous Fresnel rim glow (power 3.2)
 * - Sci-fi electric cyan/blue gradient with customizable base and accent tints
 * - Smooth radial alpha falloff with discard outside unit circle
 */

precision highp float;

// Uniforms
uniform vec3 uLightDir;
uniform float uTime;
uniform float uOpacity;
uniform vec3 uBaseColor;
uniform vec3 uSpecularColor;
uniform vec3 uRimColor;

// Varyings from Vertex Shader
varying vec3 vWorldPos;
varying float vPhase;
varying vec3 vColor;

void main() {
  // Map point coord from [0, 1] to centered [-1, 1] space
  vec2 coord = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(coord, coord);
  if (r2 > 1.0) discard;

  // Reconstruct spherical 3D surface normal
  float z = sqrt(max(0.0, 1.0 - r2));
  vec3 N = normalize(vec3(coord.x, -coord.y, z));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(uLightDir + V);

  // Specular reflection & Fresnel rim
  float specSharp = pow(max(0.0, dot(N, H)), 32.0) * 1.1;
  float rim = pow(1.0 - N.z, 3.2) * 0.75;

  // Blend base color with per-particle color attribute
  vec3 base = mix(uBaseColor, vColor, 0.25);
  vec3 col = base + specSharp * uSpecularColor + rim * uRimColor;

  // Smooth edge anti-aliasing falloff with mathematically valid edge ordering (edge0 < edge1)
  float alpha = (1.0 - smoothstep(0.80, 1.0, r2)) * uOpacity;
  gl_FragColor = vec4(col, alpha);
}
