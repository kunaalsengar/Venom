/**
 * PROJECT NEXUS — Holographic Rings Component
 * Multi-tier concentric 3D holographic gimbal rings counter-rotating in space.
 * Features segmented arc indicators and dynamic luminance oscillation.
 *
 * @module hologram/HologramRings
 */

import * as THREE from 'three';
import { HologramObject } from './HologramObject.js';
import { HologramMaterials } from './HologramMaterials.js';
import { HologramEffects } from './HologramEffects.js';
import { AppConfig } from '../config/AppConfig.js';

export class HologramRings extends HologramObject {
  /**
   * @param {Object} [config]
   */
  constructor(config = {}) {
    super('hologram_rings');

    const cfg = Object.assign({}, AppConfig.hologram.rings, config);
    this._cfg = cfg;
    this._baseOpacity = cfg.opacity;

    /** @type {Array<{ group: THREE.Group, speed: number, material: THREE.ShaderMaterial }>} */
    this._ringLayers = [];

    this._buildRings();
  }

  /**
   * Build concentric gimbal rings with distinct tilts and dash patterns
   * @private
   */
  _buildRings() {
    const radii = this._cfg.radius;
    const speeds = this._cfg.rotationSpeeds;
    const tilts = this._cfg.tilts;
    const tubeRadius = this._cfg.tubeRadius || 0.008;

    const colors = [
      HologramMaterials.COLORS.PRIMARY,   // Cyan
      HologramMaterials.COLORS.SECONDARY, // Blue
      HologramMaterials.COLORS.CORE       // Sky blue
    ];

    for (let i = 0; i < this._cfg.count; i++) {
      const radius = radii[i] || (0.8 + i * 0.45);
      const speed = speeds[i] || 0.2;
      const tilt = tilts[i] || [0, 0, 0];
      const color = colors[i % colors.length];

      // Gimbal tilt container
      const ringGroup = new THREE.Group();
      ringGroup.rotation.set(tilt[0], tilt[1], tilt[2]);

      // Segmented dash shader material
      const material = HologramMaterials.createRingShaderMaterial({
        color: color,
        opacity: this._cfg.opacity
      });
      material.uniforms.uDashFrequency.value = 8.0 + i * 6.0;
      this.trackMaterial(material);

      // Torus geometry for clean 3D tubular vector profile
      const geometry = new THREE.TorusGeometry(radius, tubeRadius, 6, 80);
      const ringMesh = new THREE.Mesh(geometry, material);
      ringMesh.frustumCulled = false;
      ringGroup.add(ringMesh);

      // Add radial tick indicators on outer ring
      if (i === this._cfg.count - 1) {
        this._addTickMarks(ringGroup, radius);
      }

      this.add(ringGroup);

      this._ringLayers.push({
        group: ringGroup,
        speed: speed,
        material: material
      });
    }
  }

  /**
   * Add high-tech compass tick marks along outer ring circumference
   * @private
   * @param {THREE.Group} targetGroup
   * @param {number} radius
   */
  _addTickMarks(targetGroup, radius) {
    const tickCount = 24;
    const tickLength = 0.06;
    const vertices = [];

    for (let i = 0; i < tickCount; i++) {
      const angle = (i / tickCount) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const isMajor = i % 6 === 0;
      const len = isMajor ? tickLength * 1.6 : tickLength;

      const r1 = radius - len * 0.5;
      const r2 = radius + len * 0.5;

      vertices.push(cosA * r1, sinA * r1, 0);
      vertices.push(cosA * r2, sinA * r2, 0);
    }

    const tickGeo = new THREE.BufferGeometry();
    tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    const tickMat = HologramMaterials.createLineMaterial({
      color: HologramMaterials.COLORS.PRIMARY,
      opacity: this._cfg.opacity * 0.85
    });
    this.trackMaterial(tickMat);

    const tickLines = new THREE.LineSegments(tickGeo, tickMat);
    tickLines.frustumCulled = false;
    targetGroup.add(tickLines);
  }

  /**
   * Per-frame animation update (Zero heap allocations)
   * @param {number} time
   * @param {number} dt
   */
  update(time, dt) {
    if (!this._visible) return;

    const pulse = HologramEffects.pulse(time, this._cfg.pulseSpeed, 0.75, 1.25);

    for (let i = 0; i < this._ringLayers.length; i++) {
      const layer = this._ringLayers[i];

      // Counter-rotate each gimbal ring around its local Z axis
      layer.group.rotation.z += layer.speed * dt;

      // Update shader uniforms
      if (layer.material.uniforms) {
        layer.material.uniforms.uTime.value = time;
        layer.material.uniforms.uPulse.value = pulse;
        layer.material.uniforms.uOpacity.value = this._opacity * this._baseOpacity;
      }
    }

    super.update(time, dt);
  }
}
