/**
 * PROJECT NEXUS — Holographic Scene Graph Manager
 * Manages the mounting, hierarchy, and per-frame update dispatch
 * of all holographic 3D components on the primary Three.js scene.
 *
 * @module hologram/HologramScene
 */

import * as THREE from 'three';
import { HologramObject } from './HologramObject.js';

export class HologramScene {
  constructor() {
    // Holographic root group mounted onto the main Three.js scene
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'HolographicSceneRoot';

    /** @type {Map<string, HologramObject>} */
    this._components = new Map();

    this._parentScene = null;
    this._camera = null;
    this._isInitialized = false;
    this._visible = true;
    this._opacity = 1.0;
  }

  /**
   * Root group accessor
   * @returns {THREE.Group}
   */
  get group() {
    return this.rootGroup;
  }

  /**
   * Component count accessor
   * @returns {number}
   */
  get size() {
    return this._components.size;
  }

  /**
   * Visibility getter
   * @returns {boolean}
   */
  get visible() {
    return this._visible;
  }

  /**
   * Visibility setter
   * @param {boolean} value
   */
  set visible(value) {
    const next = Boolean(value);
    if (this._visible === next) return;
    this._visible = next;
    this.rootGroup.visible = next;
  }

  /**
   * Opacity getter
   * @returns {number}
   */
  get opacity() {
    return this._opacity;
  }

  /**
   * Opacity setter propagating to all registered components
   * @param {number} value
   */
  set opacity(value) {
    const clamped = THREE.MathUtils.clamp(value, 0.0, 1.0);
    this._opacity = clamped;
    for (const comp of this._components.values()) {
      comp.opacity = clamped;
    }
  }

  /**
   * Initialize holographic scene and mount onto the Three.js scene graph
   * @param {THREE.Scene} parentScene
   * @param {THREE.Camera} camera
   */
  init(parentScene, camera) {
    if (!parentScene) {
      console.warn('[HologramScene] Parent scene is null or undefined.');
      return;
    }

    this._parentScene = parentScene;
    this._camera = camera;

    // Mount root group onto parent scene
    if (!this._parentScene.children.includes(this.rootGroup)) {
      this._parentScene.add(this.rootGroup);
    }

    // Initialize all registered components
    for (const comp of this._components.values()) {
      comp.init(parentScene, camera);
    }

    this._isInitialized = true;
  }

  /**
   * Register and mount a holographic component
   * @param {string} id - Unique identifier (e.g. 'grid', 'rings', 'core')
   * @param {HologramObject} component - HologramObject instance
   * @returns {HologramObject}
   */
  register(id, component) {
    if (!component || !(component instanceof HologramObject)) {
      console.warn(`[HologramScene] Invalid component for id "${id}". Must extend HologramObject.`);
      return null;
    }

    if (this._components.has(id)) {
      this.unregister(id);
    }

    this._components.set(id, component);
    this.rootGroup.add(component.group);
    component.opacity = this._opacity;

    if (this._isInitialized && this._parentScene) {
      component.init(this._parentScene, this._camera);
    }

    return component;
  }

  /**
   * Unregister and unmount a component
   * @param {string} id
   * @returns {boolean}
   */
  unregister(id) {
    const comp = this._components.get(id);
    if (!comp) return false;

    this.rootGroup.remove(comp.group);
    comp.dispose();
    this._components.delete(id);
    return true;
  }

  /**
   * Retrieve a registered component by id
   * @param {string} id
   * @returns {HologramObject|undefined}
   */
  get(id) {
    return this._components.get(id);
  }

  /**
   * Check if a component is registered
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return this._components.has(id);
  }

  /**
   * Get an array of all registered component keys
   * @returns {string[]}
   */
  getComponentIds() {
    return Array.from(this._components.keys());
  }

  /**
   * Dispatch per-frame update to all active holographic components.
   * Zero heap allocations.
   * @param {number} time
   * @param {number} dt
   */
  update(time, dt) {
    if (!this._visible) return;

    for (const comp of this._components.values()) {
      if (comp.visible) {
        comp.update(time, dt);
      }
    }
  }

  /**
   * Cleanly dispose of all components and unmount from parent scene
   */
  dispose() {
    for (const comp of this._components.values()) {
      comp.dispose();
    }
    this._components.clear();

    if (this._parentScene && this.rootGroup.parent) {
      this._parentScene.remove(this.rootGroup);
    }

    this._isInitialized = false;
  }
}
