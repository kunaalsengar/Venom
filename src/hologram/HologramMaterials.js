/**
 * PROJECT NEXUS — Holographic Materials Factory
 * Centralized shader and material creation for the JARVIS-inspired holographic interface.
 *
 * Visual Language:
 * - Electric cyan (0x00f0ff) & electric sci-fi blue (0x0077ff)
 * - Purple / violet accent (0xa855f7)
 * - Semi-transparent glassmorphic volumes
 * - Luminous edges & Fresnel rim glow
 * - Dynamic scanline modulation
 * - Additive blending (THREE.AdditiveBlending) with depthWrite: false
 *
 * @module hologram/HologramMaterials
 */

import * as THREE from 'three';
import { AppConfig } from '../config/AppConfig.js';

export class HologramMaterials {
  /**
   * Palette constants matching AppConfig
   */
  static COLORS = Object.freeze({
    PRIMARY: AppConfig.hologram.colors.primary,     // 0x00f0ff
    SECONDARY: AppConfig.hologram.colors.secondary, // 0x0077ff
    ACCENT: AppConfig.hologram.colors.accent,       // 0xa855f7
    AMBIENT: AppConfig.hologram.colors.ambient,     // 0x002244
    GRID: AppConfig.hologram.colors.grid,           // 0x004488
    CORE: AppConfig.hologram.colors.core            // 0x38bdf8
  });

  /**
   * Create an additive glowing wireframe mesh material
   * @param {Object} [options]
   * @param {number} [options.color]
   * @param {number} [options.opacity]
   * @returns {THREE.MeshBasicMaterial}
   */
  static createWireframeMaterial(options = {}) {
    const color = options.color !== undefined ? options.color : HologramMaterials.COLORS.PRIMARY;
    const opacity = options.opacity !== undefined ? options.opacity : 0.65;

    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      wireframe: true,
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }

  /**
   * Create an additive line basic material
   * @param {Object} [options]
   * @param {number} [options.color]
   * @param {number} [options.opacity]
   * @returns {THREE.LineBasicMaterial}
   */
  static createLineMaterial(options = {}) {
    const color = options.color !== undefined ? options.color : HologramMaterials.COLORS.PRIMARY;
    const opacity = options.opacity !== undefined ? options.opacity : 0.55;

    return new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: 1
    });
  }

  /**
   * Create a holographic Fresnel rim glow shader material
   * Luminous edges facing away from camera view normal, combined with scanline stripes.
   * @param {Object} [options]
   * @param {number} [options.color]
   * @param {number} [options.opacity]
   * @param {number} [options.fresnelPower]
   * @param {number} [options.scanlineFreq]
   * @returns {THREE.ShaderMaterial}
   */
  static createFresnelGlowMaterial(options = {}) {
    const hexColor = options.color !== undefined ? options.color : HologramMaterials.COLORS.PRIMARY;
    const opacity = options.opacity !== undefined ? options.opacity : 0.70;
    const fresnelPower = options.fresnelPower !== undefined ? options.fresnelPower : 2.5;
    const scanlineFreq = options.scanlineFreq !== undefined ? options.scanlineFreq : 35.0;

    const baseColor = new THREE.Color(hexColor);

    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0.0 },
        uColor: { value: new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b) },
        uFresnelPower: { value: fresnelPower },
        uScanlineFreq: { value: scanlineFreq },
        uScanlineSpeed: { value: 1.8 },
        uOpacity: { value: opacity },
        uPulse: { value: 1.0 }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;

        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        precision highp float;

        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec3 vWorldPosition;

        uniform float uTime;
        uniform vec3 uColor;
        uniform float uFresnelPower;
        uniform float uScanlineFreq;
        uniform float uScanlineSpeed;
        uniform float uOpacity;
        uniform float uPulse;

        void main() {
          vec3 viewDir = normalize(vViewPosition);
          float dotNV = max(dot(vNormal, viewDir), 0.0);
          float fresnel = pow(1.0 - dotNV, uFresnelPower);

          // Moving horizontal scanlines
          float scanline = 0.85 + 0.15 * sin(vWorldPosition.y * uScanlineFreq + uTime * uScanlineSpeed);

          // Edge glow boosted by fresnel + slight inner luminescence
          float intensity = (0.25 + 0.75 * fresnel) * scanline * uPulse;
          vec3 finalColor = uColor * intensity * 1.35;

          float alpha = clamp((fresnel * 0.85 + 0.15) * uOpacity * uPulse, 0.0, 1.0);
          gl_FragColor = vec4(finalColor, alpha);
        }
      `
    });
  }

  /**
   * Create spatial ground grid shader material with circular distance falloff
   * @param {Object} [options]
   * @param {number} [options.color]
   * @param {number} [options.opacity]
   * @param {number} [options.maxRadius]
   * @returns {THREE.ShaderMaterial}
   */
  static createGridShaderMaterial(options = {}) {
    const hexColor = options.color !== undefined ? options.color : HologramMaterials.COLORS.GRID;
    const opacity = options.opacity !== undefined ? options.opacity : 0.22;
    const maxRadius = options.maxRadius !== undefined ? options.maxRadius : 6.5;

    const baseColor = new THREE.Color(hexColor);

    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0.0 },
        uColor: { value: new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b) },
        uAccentColor: { value: new THREE.Vector3(0.0, 0.94, 1.0) }, // Cyan accent for center
        uMaxRadius: { value: maxRadius },
        uOpacity: { value: opacity },
        uPulseSpeed: { value: 0.8 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;

        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        precision highp float;

        varying vec3 vWorldPosition;

        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uAccentColor;
        uniform float uMaxRadius;
        uniform float uOpacity;
        uniform float uPulseSpeed;

        void main() {
          float dist = length(vWorldPosition.xz);
          if (dist > uMaxRadius) {
            discard;
          }

          // Smooth quadratic falloff towards edge of grid
          float falloff = clamp(1.0 - (dist / uMaxRadius), 0.0, 1.0);
          falloff = falloff * falloff;

          // Subtle radial radar/scan pulse sweeping outward
          float wave = sin(dist * 2.2 - uTime * uPulseSpeed * 3.14159);
          wave = smoothstep(0.7, 1.0, wave) * 0.4;

          vec3 col = mix(uColor, uAccentColor, wave + (1.0 - dist / uMaxRadius) * 0.3);
          float alpha = (falloff * (0.8 + wave)) * uOpacity;

          gl_FragColor = vec4(col, alpha);
        }
      `
    });
  }

  /**
   * Create rotating ring shader material with angular dash segments
   * @param {Object} [options]
   * @param {number} [options.color]
   * @param {number} [options.opacity]
   * @returns {THREE.ShaderMaterial}
   */
  static createRingShaderMaterial(options = {}) {
    const hexColor = options.color !== undefined ? options.color : HologramMaterials.COLORS.PRIMARY;
    const opacity = options.opacity !== undefined ? options.opacity : 0.45;
    const baseColor = new THREE.Color(hexColor);

    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0.0 },
        uColor: { value: new THREE.Vector3(baseColor.r, baseColor.g, baseColor.b) },
        uOpacity: { value: opacity },
        uDashFrequency: { value: 12.0 },
        uPulse: { value: 1.0 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;

        void main() {
          vUv = uv;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        varying vec2 vUv;
        varying vec3 vPosition;

        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uDashFrequency;
        uniform float uPulse;

        void main() {
          // Angular coordinate
          float angle = atan(vPosition.y, vPosition.x);
          float segment = sin(angle * uDashFrequency);

          // Subtle segment notches
          float dash = smoothstep(-0.2, 0.4, segment);
          float intensity = (0.45 + 0.55 * dash) * uPulse;

          gl_FragColor = vec4(uColor * intensity * 1.25, uOpacity * intensity);
        }
      `
    });
  }
}
