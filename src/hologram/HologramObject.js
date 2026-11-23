/**
 * PROJECT NEXUS — Holographic Object Base Class
 * Extensible base class for all 3D holographic scene entities.
 *
 * Provides lifecycle management, hierarchical transform control,
 * material tracking, uniform opacity cascades, and zero-allocation per-frame updates.
 *
 * @module hologram/HologramObject
 */

import * as THREE from 'three';

export class HologramObject {
  /**
   * @param {string} [id] - Unique identifier for the holographic object
   */
  constructor(id = '') {
    this.id = id || ('holo_' + Math.random().toString(36).substring(2, 9));

    // Root Three.js container
    this.group = new THREE.Group();
    this.group.name = this.id;

    // Internal state
    this._visible = true;
    this._opacity = 1.0;
    this._baseOpacity = 1.0;
    this._disposed = false;
    this._isInitialized = false;

    // Tracked materials for uniform opacity & uniform updates
    /** @type {Set<THREE.Material>} */
    this._materials = new Set();

    // Cache child holographic objects
    /** @type {Map<string, HologramObject>} */
    this._children = new Map();
  }

  /**
   * Object position accessor forwarding to root group
   * @returns {THREE.Vector3}
   */
  get position() {
    return this.group.position;
  }

  /**
   * Object rotation accessor forwarding to root group
   * @returns {THREE.Euler}
   */
  get rotation() {
    return this.group.rotation;
  }

  /**
   * Object scale accessor forwarding to root group
   * @returns {THREE.Vector3}
   */
  get scale() {
    return this.group.scale;
  }

  /**
   * Object quaternion accessor forwarding to root group
   * @returns {THREE.Quaternion}
   */
  get quaternion() {
    return this.group.quaternion;
  }

  /**
   * Visibility flag getter
   * @returns {boolean}
   */
  get visible() {
    return this._visible;
  }

  /**
   * Visibility flag setter
   * @param {boolean} value
   */
  set visible(value) {
    const next = Boolean(value);
    if (this._visible === next) return;
    this._visible = next;
    this.group.visible = next;
  }

  /**
   * Opacity getter
   * @returns {number}
   */
  get opacity() {
    return this._opacity;
  }

  /**
   * Opacity setter with cascading material propagation
   * @param {number} value - Normalized opacity [0.0 - 1.0]
   */
  set opacity(value) {
    const clamped = THREE.MathUtils.clamp(value, 0.0, 1.0);
    this._opacity = clamped;
    this._applyOpacityToMaterials(clamped * this._baseOpacity);

    // Cascade to child holographic objects
    for (const child of this._children.values()) {
      child.setParentOpacity(clamped);
    }
  }

  /**
   * Internal cascade helper for child hierarchy
   * @param {number} parentOpacity
   */
  setParentOpacity(parentOpacity) {
    const effective = this._opacity * parentOpacity * this._baseOpacity;
    this._applyOpacityToMaterials(effective);
    for (const child of this._children.values()) {
      child.setParentOpacity(effective);
    }
  }

  /**
   * Register a Three.js material to receive opacity and uniform cascades
   * @param {THREE.Material} material
   * @returns {THREE.Material}
   */
  trackMaterial(material) {
    if (material) {
      this._materials.add(material);
      if (typeof material.opacity === 'number') {
        material.opacity = this._opacity * this._baseOpacity;
      }
      if (material.uniforms && material.uniforms.uOpacity) {
        material.uniforms.uOpacity.value = this._opacity * this._baseOpacity;
      }
    }
    return material;
  }

  /**
   * Unregister a tracked material
   * @param {THREE.Material} material
   */
  untrackMaterial(material) {
    if (material) {
      this._materials.delete(material);
    }
  }

  /**
   * Apply opacity to all tracked materials and child meshes
   * @private
   * @param {number} effectiveOpacity
   */
  _applyOpacityToMaterials(effectiveOpacity) {
    for (const mat of this._materials) {
      if (typeof mat.opacity === 'number') {
        mat.opacity = effectiveOpacity;
      }
      if (mat.uniforms && mat.uniforms.uOpacity) {
        mat.uniforms.uOpacity.value = effectiveOpacity;
      }
    }
  }

  /**
   * Add a child HologramObject or standard Three.js Object3D
   * @param {HologramObject|THREE.Object3D} child
   * @returns {this}
   */
  add(child) {
    if (child instanceof HologramObject) {
      this._children.set(child.id, child);
      this.group.add(child.group);
      child.setParentOpacity(this._opacity);
    } else if (child && child.isObject3D) {
      this.group.add(child);
      // Auto-track materials on attached meshes/lines
      child.traverse((node) => {
        if (node.material) {
          if (Array.isArray(node.material)) {
            node.material.forEach((m) => this.trackMaterial(m));
          } else {
            this.trackMaterial(node.material);
          }
        }
      });
    }
    return this;
  }

  /**
   * Remove a child HologramObject or standard Three.js Object3D
   * @param {HologramObject|THREE.Object3D} child
   * @returns {this}
   */
  remove(child) {
    if (child instanceof HologramObject) {
      this._children.delete(child.id);
      this.group.remove(child.group);
    } else if (child && child.isObject3D) {
      this.group.remove(child);
    }
    return this;
  }

  /**
   * Lifecycle initialization hook
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  init(scene, camera) {
    this._isInitialized = true;
    for (const child of this._children.values()) {
      child.init(scene, camera);
    }
  }

  /**
   * Per-frame animation update hook.
   * MUST NOT perform any heap allocations (zero garbage collection).
   * @param {number} time - Elapsed time in seconds
   * @param {number} dt - Frame delta time in seconds
   */
  update(time, dt) {
    if (!this._visible) return;

    // Update child components
    for (const child of this._children.values()) {
      if (child.visible) {
        child.update(time, dt);
      }
    }
  }

  /**
   * Cleanly dispose of all geometries, materials, textures, and child references
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    // Dispose child holographic objects
    for (const child of this._children.values()) {
      child.dispose();
    }
    this._children.clear();

    // Traverse root group and dispose resources
    this.group.traverse((node) => {
      if (node.geometry) {
        node.geometry.dispose();
      }
      if (node.material) {
        if (Array.isArray(node.material)) {
          node.material.forEach((mat) => {
            if (mat.map) mat.map.dispose();
            mat.dispose();
          });
        } else {
          if (node.material.map) node.material.map.dispose();
          node.material.dispose();
        }
      }
    });

    this._materials.clear();

    // Detach from parent
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}
