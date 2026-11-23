/**
 * PROJECT NEXUS — Holographic Core Component
 * Central 3D layered geometric power core coexisting with the symbiote.
 *
 * Structure:
 * - Inner icosahedral crystal with Fresnel rim glow and scanlines
 * - Outer wireframe containment octahedron / cage with smooth counter-rotation
 * - Orbiting satellite micro-nodes
 * - Breathing scale pulsation
 *
 * @module hologram/HologramCore
 */

import * as THREE from 'three';
import { HologramObject } from './HologramObject.js';
import { HologramMaterials } from './HologramMaterials.js';
import { HologramEffects } from './HologramEffects.js';
import { AppConfig } from '../config/AppConfig.js';

export class HologramCore extends HologramObject {
  /**
   * @param {Object} [config]
   */
  constructor(config = {}) {
    super('hologram_core');

    const cfg = Object.assign({}, AppConfig.hologram.core, config);
    this._cfg = cfg;
    this._baseOpacity = cfg.opacity;

    this.position.y = cfg.yOffset || 0.0;

    this._buildCore();
  }

  /**
   * Build multi-layered central core geometry
   * @private
   */
  _buildCore() {
    const r = this._cfg.radius;

    // 1. Inner Fresnel Glow Crystal (Icosahedron)
    const innerGeo = new THREE.IcosahedronGeometry(r * 0.72, 1);
    this._innerMat = HologramMaterials.createFresnelGlowMaterial({
      color: HologramMaterials.COLORS.PRIMARY,
      opacity: this._cfg.opacity,
      fresnelPower: 2.2,
      scanlineFreq: 30.0
    });
    this.trackMaterial(this._innerMat);
    this._innerMesh = new THREE.Mesh(innerGeo, this._innerMat);
    this._innerMesh.frustumCulled = false;
    this.add(this._innerMesh);

    // 2. Outer Wireframe Containment Cage (Octahedron)
    const cageGeo = new THREE.OctahedronGeometry(r * 1.18, 0);
    this._cageMat = HologramMaterials.createWireframeMaterial({
      color: HologramMaterials.COLORS.CORE,
      opacity: this._cfg.opacity * 0.65
    });
    this.trackMaterial(this._cageMat);
    this._cageMesh = new THREE.Mesh(cageGeo, this._cageMat);
    this._cageMesh.frustumCulled = false;
    this.add(this._cageMesh);

    // 3. Orbiting Satellite Micro-Nodes Group
    this._orbitGroup = new THREE.Group();
    this._orbitGroup.rotation.x = 0.45;

    const nodeGeo = new THREE.TetrahedronGeometry(0.04, 0);
    const nodeMat = HologramMaterials.createWireframeMaterial({
      color: HologramMaterials.COLORS.ACCENT,
      opacity: 0.8
    });
    this.trackMaterial(nodeMat);

    const orbitRadius = r * 1.55;
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const nodeMesh = new THREE.Mesh(nodeGeo, nodeMat);
      nodeMesh.position.set(Math.cos(angle) * orbitRadius, Math.sin(angle) * orbitRadius, 0);
      nodeMesh.frustumCulled = false;
      this._orbitGroup.add(nodeMesh);
    }

    this.add(this._orbitGroup);
  }

  /**
   * Per-frame animation update (Zero heap allocations)
   * @param {number} time
   * @param {number} dt
   */
  update(time, dt) {
    if (!this._visible) return;

    const rotSpeed = this._cfg.rotationSpeed;

    // Multi-axis rotation of inner crystal
    this._innerMesh.rotation.x += rotSpeed * 0.6 * dt;
    this._innerMesh.rotation.y += rotSpeed * 0.9 * dt;

    // Counter-rotation of outer cage
    this._cageMesh.rotation.y -= rotSpeed * 0.5 * dt;
    this._cageMesh.rotation.z += rotSpeed * 0.3 * dt;

    // Orbit satellite micro-nodes
    this._orbitGroup.rotation.z += rotSpeed * 1.4 * dt;

    // Breathing scale pulsation
    const scalePulse = 1.0 + Math.sin(time * this._cfg.pulseSpeed) * this._cfg.pulseScale;
    this.scale.set(scalePulse, scalePulse, scalePulse);

    // Update inner shader uniform
    if (this._innerMat.uniforms) {
      this._innerMat.uniforms.uTime.value = time;
      this._innerMat.uniforms.uPulse.value = 0.85 + 0.15 * Math.sin(time * 3.0);
      this._innerMat.uniforms.uOpacity.value = this._opacity * this._baseOpacity;
    }

    super.update(time, dt);
  }
}
