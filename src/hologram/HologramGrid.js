/**
 * PROJECT NEXUS — Holographic Grid Component
 * Spatial ground reference plane with distance attenuation, radial concentric range circles,
 * and dynamic scanline wave animation.
 *
 * @module hologram/HologramGrid
 */

import * as THREE from 'three';
import { HologramObject } from './HologramObject.js';
import { HologramMaterials } from './HologramMaterials.js';
import { AppConfig } from '../config/AppConfig.js';

export class HologramGrid extends HologramObject {
  /**
   * @param {Object} [config]
   */
  constructor(config = {}) {
    super('hologram_grid');

    const cfg = Object.assign({}, AppConfig.hologram.grid, config);
    this._cfg = cfg;
    this._baseOpacity = cfg.opacity;

    this.position.y = cfg.yOffset;

    // Create shader material for spatial grid plane
    this._material = HologramMaterials.createGridShaderMaterial({
      color: cfg.color,
      opacity: cfg.opacity,
      maxRadius: cfg.maxRadius
    });
    this.trackMaterial(this._material);

    this._buildGridGeometry();
  }

  /**
   * Construct Cartesian line grid and concentric polar range circles
   * @private
   */
  _buildGridGeometry() {
    const size = this._cfg.size;
    const divisions = this._cfg.divisions;
    const half = size * 0.5;
    const step = size / divisions;

    const vertices = [];

    // Cartesian Grid Lines (X and Z)
    for (let i = 0; i <= divisions; i++) {
      const coord = -half + i * step;

      // Line parallel to Z axis (along X)
      vertices.push(coord, 0, -half);
      vertices.push(coord, 0, half);

      // Line parallel to X axis (along Z)
      vertices.push(-half, 0, coord);
      vertices.push(half, 0, coord);
    }

    // Concentric Range Rings (r = 1.5, 3.0, 4.5, 6.0)
    const ringRadii = [1.5, 3.0, 4.5, 6.0];
    const ringSegments = 64;

    for (const radius of ringRadii) {
      for (let s = 0; s < ringSegments; s++) {
        const theta1 = (s / ringSegments) * Math.PI * 2;
        const theta2 = ((s + 1) / ringSegments) * Math.PI * 2;

        vertices.push(Math.cos(theta1) * radius, 0, Math.sin(theta1) * radius);
        vertices.push(Math.cos(theta2) * radius, 0, Math.sin(theta2) * radius);
      }
    }

    // Center Crosshair Marker
    const crossSize = 0.4;
    vertices.push(-crossSize, 0, 0, crossSize, 0, 0);
    vertices.push(0, 0, -crossSize, 0, 0, crossSize);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    const lineSegments = new THREE.LineSegments(geometry, this._material);
    lineSegments.frustumCulled = false;
    this.add(lineSegments);
  }

  /**
   * Per-frame animation update (Zero heap allocations)
   * @param {number} time
   * @param {number} dt
   */
  update(time, dt) {
    if (!this._visible) return;

    if (this._material.uniforms) {
      this._material.uniforms.uTime.value = time;
      this._material.uniforms.uOpacity.value = this._opacity * this._baseOpacity;
    }

    super.update(time, dt);
  }
}
