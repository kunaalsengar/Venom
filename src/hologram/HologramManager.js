/**
 * PROJECT NEXUS — Central Hologram Manager
 * Master controller and coordinator for the 3D Holographic Interface Foundation.
 *
 * Responsibilities:
 * - Integrates with existing Three.js scene and perspective camera
 * - Coordinates component lifecycle (grid, rings, core, custom widgets)
 * - Dispatches zero-allocation 60 FPS animation updates inside main render loop
 * - Synchronizes with StateManager and EventBus
 * - Provides inspection and control APIs for runtime debugging
 *
 * @module hologram/HologramManager
 */

import * as THREE from 'three';
import { HologramScene } from './HologramScene.js';
import { HologramGrid } from './HologramGrid.js';
import { HologramRings } from './HologramRings.js';
import { HologramCore } from './HologramCore.js';
import { AppConfig } from '../config/AppConfig.js';
import { Events, eventBus } from '../core/EventBus.js';
import { stateManager } from '../core/StateManager.js';

export class HologramManager {
  constructor() {
    this._scene = new HologramScene();
    this._parentScene = null;
    this._camera = null;
    this._isReady = false;

    // Config defaults
    this._enabled = AppConfig.hologram.enabled;
    this._opacity = AppConfig.hologram.opacity;
    this._quality = 'high';

    // Track event unsubscribers
    this._unsubscribers = [];
  }

  /**
   * Readiness flag accessor
   * @returns {boolean}
   */
  get isReady() {
    return this._isReady;
  }

  /**
   * HologramScene accessor
   * @returns {HologramScene}
   */
  get scene() {
    return this._scene;
  }

  /**
   * Visibility getter
   * @returns {boolean}
   */
  get visible() {
    return this._scene.visible;
  }

  /**
   * Opacity getter
   * @returns {number}
   */
  get opacity() {
    return this._opacity;
  }

  /**
   * Quality level getter ('low' | 'medium' | 'high')
   * @returns {string}
   */
  get quality() {
    return this._quality;
  }

  /**
   * Initialize holographic interface and register foundational components
   * @param {THREE.Scene} parentScene - Main Three.js Scene
   * @param {THREE.Camera} camera - Main PerspectiveCamera
   * @returns {this}
   */
  init(parentScene, camera) {
    if (this._isReady) {
      console.warn('[HologramManager] Already initialized.');
      return this;
    }

    if (!parentScene || !camera) {
      console.error('[HologramManager] Missing required parentScene or camera.');
      return this;
    }

    this._parentScene = parentScene;
    this._camera = camera;

    // Initialize HologramScene and mount to Three.js scene
    this._scene.init(parentScene, camera);
    this._scene.opacity = this._opacity;
    this._scene.visible = this._enabled;

    // Build & register foundational components
    this._initBuiltinComponents();

    // Subscribe to EventBus notifications
    this._setupEventListeners();

    this._isReady = true;
    return this;
  }

  /**
   * Instantiate foundational built-in holographic elements
   * @private
   */
  _initBuiltinComponents() {
    // 1. Spatial Reference Grid
    if (AppConfig.hologram.grid.enabled) {
      const grid = new HologramGrid();
      this._scene.register('grid', grid);
    }

    // 2. Concentric 3D Gimbal Rings
    if (AppConfig.hologram.rings.enabled) {
      const rings = new HologramRings();
      this._scene.register('rings', rings);
    }

    // 3. Central Layered Power Core
    if (AppConfig.hologram.core.enabled) {
      const core = new HologramCore();
      this._scene.register('core', core);
    }
  }

  /**
   * Setup EventBus listeners for reactive state synchronization
   * @private
   */
  _setupEventListeners() {
    const unsubVis = eventBus.on(Events.HOLOGRAM_VISIBILITY, ({ visible }) => {
      this.setVisibility(visible, false);
    });
    this._unsubscribers.push(unsubVis);

    const unsubOpac = eventBus.on(Events.HOLOGRAM_OPACITY, ({ opacity }) => {
      this.setOpacity(opacity, false);
    });
    this._unsubscribers.push(unsubOpac);

    const unsubQuality = eventBus.on(Events.HOLOGRAM_QUALITY, ({ quality }) => {
      this.setQuality(quality, false);
    });
    this._unsubscribers.push(unsubQuality);

    // React to experience mode changes
    const unsubMode = eventBus.on(Events.MODE_CHANGE, ({ activeMode }) => {
      if (activeMode === 'hologram') {
        this.setVisibility(true, true);
        this.setOpacity(AppConfig.hologram.opacity, true);
      } else if (activeMode === 'particle' || activeMode === 'energy') {
        // Subtle ambient presence in particle/energy modes
        this.setOpacity(0.35, true);
      }
    });
    this._unsubscribers.push(unsubMode);
  }

  /**
   * Primary animation update called each frame inside the single 60 FPS render loop.
   * ZERO HEAP ALLOCATIONS.
   * @param {number} time - Elapsed time in seconds
   * @param {number} dt - Frame delta time in seconds
   */
  update(time, dt) {
    if (!this._isReady || !this._scene.visible) return;
    this._scene.update(time, dt);
  }

  /**
   * Set holographic interface visibility
   * @param {boolean} visible
   * @param {boolean} [syncState=true]
   */
  setVisibility(visible, syncState = true) {
    const next = Boolean(visible);
    this._scene.visible = next;
    this._enabled = next;

    if (syncState && stateManager) {
      stateManager.setHologramVisibility(next);
    }
  }

  /**
   * Show holographic interface
   */
  show() {
    this.setVisibility(true, true);
  }

  /**
   * Hide holographic interface
   */
  hide() {
    this.setVisibility(false, true);
  }

  /**
   * Toggle holographic interface visibility
   * @returns {boolean} New visibility state
   */
  toggle() {
    const next = !this.visible;
    this.setVisibility(next, true);
    return next;
  }

  /**
   * Set global holographic interface opacity [0.0 - 1.0]
   * @param {number} opacity
   * @param {boolean} [syncState=true]
   */
  setOpacity(opacity, syncState = true) {
    const clamped = THREE.MathUtils.clamp(opacity, 0.0, 1.0);
    this._opacity = clamped;
    this._scene.opacity = clamped;

    if (syncState && stateManager) {
      stateManager.setHologramOpacity(clamped);
    }
  }

  /**
   * Set performance quality tier ('low' | 'medium' | 'high')
   * @param {'low'|'medium'|'high'} quality
   * @param {boolean} [syncState=true]
   */
  setQuality(quality, syncState = true) {
    this._quality = quality;

    const grid = this._scene.get('grid');
    const rings = this._scene.get('rings');
    const core = this._scene.get('core');

    if (quality === 'low') {
      if (grid) grid.visible = false;
      if (rings) rings.visible = true;
      if (core) core.visible = true;
    } else if (quality === 'medium') {
      if (grid) grid.visible = true;
      if (rings) rings.visible = true;
      if (core) core.visible = true;
    } else {
      // 'high'
      if (grid) grid.visible = true;
      if (rings) rings.visible = true;
      if (core) core.visible = true;
    }

    if (syncState && stateManager) {
      stateManager.setHologramQuality(quality);
    }
  }

  /**
   * Retrieve a holographic component by id
   * @param {string} id
   * @returns {import('./HologramObject.js').HologramObject|undefined}
   */
  getComponent(id) {
    return this._scene.get(id);
  }

  /**
   * Register a custom holographic component
   * @param {string} id
   * @param {import('./HologramObject.js').HologramObject} component
   * @returns {import('./HologramObject.js').HologramObject}
   */
  registerComponent(id, component) {
    return this._scene.register(id, component);
  }

  /**
   * Unregister and dispose of a component
   * @param {string} id
   * @returns {boolean}
   */
  unregisterComponent(id) {
    return this._scene.unregister(id);
  }

  /**
   * Return comprehensive runtime telemetry for debugging and HUD displays
   * @returns {Object}
   */
  getStats() {
    return {
      isReady: this._isReady,
      visible: this.visible,
      opacity: this._opacity,
      quality: this._quality,
      componentCount: this._scene.size,
      components: this._scene.getComponentIds().map((id) => {
        const comp = this._scene.get(id);
        return {
          id,
          visible: comp ? comp.visible : false,
          opacity: comp ? comp.opacity : 0
        };
      })
    };
  }

  /**
   * Cleanly teardown and dispose of all resources
   */
  dispose() {
    for (const unsub of this._unsubscribers) {
      unsub();
    }
    this._unsubscribers = [];

    this._scene.dispose();
    this._isReady = false;
  }
}

/**
 * Singleton instance of HologramManager
 */
export const hologramManager = new HologramManager();

// Expose safe global debug reference for browser console inspection
if (typeof window !== 'undefined' && !window.hologramManager) {
  window.hologramManager = hologramManager;
}
