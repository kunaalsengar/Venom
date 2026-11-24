/**
 * PROJECT NEXUS — GPU Particle Engine Architecture
 * Master controller and coordinator for the high-density GPU particle system.
 * Phase 5, Step 5.1: GPU Buffer-Geometry Particle Engine Architecture
 *
 * Responsibilities:
 * - High-density particle buffer-geometry allocation (supports 10,000+ particles)
 * - Custom typed buffer attributes: position, aVelocity, aPhase, aSize, aColor, aLifetime
 * - Encapsulated GPU ShaderMaterial with perspective point attenuation & specular glints
 * - Zero-allocation dynamic particle count scaling via geometry.setDrawRange()
 * - Centralized lifecycle management: initialization, visibility toggling, quality presets, and disposal
 * - Zero garbage-collection overhead inside the 60 FPS animation loop
 * - Synchronizes with StateManager and EventBus
 *
 * @module particles/ParticleEngine
 */

import * as THREE from 'three';
import { ParticleShaders } from './ParticleShaders.js';
import { AppConfig } from '../config/AppConfig.js';
import { eventBus, Events } from '../core/EventBus.js';
import { stateManager } from '../core/StateManager.js';

export class ParticleEngine {
  constructor() {
    this._cfg = AppConfig.particles || {};

    // Capacity and active counts
    this._capacity = this._cfg.maxCount || 15000;
    this._count = Math.min(this._cfg.count || 3000, this._capacity);

    // Three.js primitives
    /** @type {THREE.BufferGeometry|null} */
    this._geometry = null;
    /** @type {THREE.ShaderMaterial|null} */
    this._material = null;
    /** @type {THREE.Points|null} */
    this._points = null;
    /** @type {THREE.Scene|null} */
    this._parentScene = null;
    /** @type {THREE.Camera|null} */
    this._camera = null;

    // Raw typed arrays for efficient buffer access & future physics
    this._positions = null;
    this._velocities = null;
    this._phases = null;
    this._sizes = null;
    this._colors = null;
    this._lifetimes = null;

    // State flags
    this._isInitialized = false;
    this._visible = this._cfg.enabled !== false;
    this._quality = 'medium';
    this._simulationMode = this._cfg.simulationMode || 'gpu'; // 'gpu' | 'manual'

    // Force field configuration & tracking state (Phase 5, Step 5.2)
    this._forceFieldCfg = this._cfg.forceField || {};
    this._forceField = {
      enabled: this._forceFieldCfg.enabled !== false,
      mode: 'none', // 'none' | 'attract' | 'repel'
      targetMode: 'none',
      position: new THREE.Vector3(0, 0, 0),
      targetPosition: new THREE.Vector3(0, 0, 0),
      radius: this._forceFieldCfg.radius || 2.20,
      targetRadius: this._forceFieldCfg.radius || 2.20,
      strength: 0.0,
      targetStrength: 0.0,
      falloff: this._forceFieldCfg.falloff || 2.0,
      maxDisplacement: this._forceFieldCfg.maxDisplacement || 2.50,
      weight: 0.0,
      targetWeight: 0.0,
      smoothing: this._forceFieldCfg.smoothing || 12.0
    };

    // Hand-Controlled Particle Interaction (Phase 5, Step 5.3)
    this._handCfg = this._cfg.handInteraction || {};
    this._handInteractionEnabled = this._handCfg.enabled !== false;
    const leftCfg = this._handCfg.left || {};
    const rightCfg = this._handCfg.right || {};

    this._hands = {
      left: {
        detected: false,
        active: false,
        lastSeenTime: 0,
        position: new THREE.Vector3(0, 0, 0),
        targetPosition: new THREE.Vector3(0, 0, 0),
        mode: leftCfg.mode || this._handCfg.leftMode || 'repel',
        targetMode: leftCfg.mode || this._handCfg.leftMode || 'repel',
        radius: leftCfg.radius || this._handCfg.radius || 2.20,
        targetRadius: leftCfg.radius || this._handCfg.radius || 2.20,
        strength: 0.0,
        targetStrength: 0.0,
        attractStrength: leftCfg.attractStrength || this._handCfg.attractStrength || 1.20,
        repelStrength: leftCfg.repelStrength || this._handCfg.repelStrength || 1.50,
        falloff: leftCfg.falloff || this._handCfg.falloff || 2.0,
        maxDisplacement: leftCfg.maxDisplacement || this._handCfg.maxDisplacement || 2.50,
        weight: 0.0,
        targetWeight: 0.0,
        smoothing: this._handCfg.smoothing || 18.0
      },
      right: {
        detected: false,
        active: false,
        lastSeenTime: 0,
        position: new THREE.Vector3(0, 0, 0),
        targetPosition: new THREE.Vector3(0, 0, 0),
        mode: rightCfg.mode || this._handCfg.rightMode || 'attract',
        targetMode: rightCfg.mode || this._handCfg.rightMode || 'attract',
        radius: rightCfg.radius || this._handCfg.radius || 2.20,
        targetRadius: rightCfg.radius || this._handCfg.radius || 2.20,
        strength: 0.0,
        targetStrength: 0.0,
        attractStrength: rightCfg.attractStrength || this._handCfg.attractStrength || 1.20,
        repelStrength: rightCfg.repelStrength || this._handCfg.repelStrength || 1.50,
        falloff: rightCfg.falloff || this._handCfg.falloff || 2.0,
        maxDisplacement: rightCfg.maxDisplacement || this._handCfg.maxDisplacement || 2.50,
        weight: 0.0,
        targetWeight: 0.0,
        smoothing: this._handCfg.smoothing || 18.0
      }
    };

    // Event unsubscribers
    this._unsubscribers = [];
  }

  /**
   * Readiness flag accessor
   * @returns {boolean}
   */
  get isReady() {
    return this._isInitialized;
  }

  /**
   * THREE.Points instance accessor
   * @returns {THREE.Points|null}
   */
  get points() {
    return this._points;
  }

  /**
   * THREE.BufferGeometry accessor
   * @returns {THREE.BufferGeometry|null}
   */
  get geometry() {
    return this._geometry;
  }

  /**
   * THREE.ShaderMaterial accessor
   * @returns {THREE.ShaderMaterial|null}
   */
  get material() {
    return this._material;
  }

  /**
   * Currently active particle count
   * @returns {number}
   */
  get count() {
    return this._count;
  }

  /**
   * Maximum buffer capacity
   * @returns {number}
   */
  get capacity() {
    return this._capacity;
  }

  /**
   * Visibility flag accessor
   * @returns {boolean}
   */
  get visible() {
    return this._visible;
  }

  /**
   * Initialize GPU Particle Engine and mount into scene graph
   *
   * @param {THREE.Scene} scene - Parent Three.js scene
   * @param {THREE.Camera} camera - Main perspective camera
   * @param {Object} [options={}] - Custom configuration overrides
   * @returns {this}
   */
  init(scene, camera, options = {}) {
    if (this._isInitialized) {
      console.warn('[ParticleEngine] Already initialized.');
      return this;
    }

    this._parentScene = scene;
    this._camera = camera;

    // 1. Determine particle capacity & initial count
    if (options.maxCount) this._capacity = options.maxCount;
    if (options.count) this._count = Math.min(options.count, this._capacity);

    const N = this._capacity;
    const baseDpr = options.dpr || (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1);

    // 2. Allocate typed arrays for GPU buffer attributes
    this._positions = new Float32Array(N * 3);
    this._velocities = new Float32Array(N * 3);
    this._phases = new Float32Array(N);
    this._sizes = new Float32Array(N);
    this._colors = new Float32Array(N * 3);
    this._lifetimes = new Float32Array(N * 2);

    // Electric cyan/blue sci-fi palette constants
    const colPrimary = new THREE.Color(0x00f0ff);   // Electric cyan
    const colSecondary = new THREE.Color(0x0077ff); // Electric sci-fi blue
    const colAccent = new THREE.Color(0xa855f7);    // Violet accent
    const _tempColor = new THREE.Color();

    // 3. Seed deterministic initial particle distribution
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const i2 = i * 2;

      // Spatial distribution: volumetric mist around scene origin
      const rad = 0.4 + Math.random() * 1.1;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.7;

      this._positions[i3] = Math.cos(theta) * Math.cos(phi) * rad;
      this._positions[i3 + 1] = Math.sin(phi) * rad;
      this._positions[i3 + 2] = Math.sin(theta) * Math.cos(phi) * rad * 0.6;

      // Base velocity vector (amplitude for GPU drift)
      this._velocities[i3] = (Math.random() - 0.5) * 0.2;
      this._velocities[i3 + 1] = (Math.random() - 0.5) * 0.2;
      this._velocities[i3 + 2] = (Math.random() - 0.5) * 0.1;

      // Phase & size variation
      this._phases[i] = Math.random() * Math.PI * 2;
      this._sizes[i] = 0.5 + Math.random() * 0.9;

      // Palette distribution: 70% cyan, 20% deep blue, 10% violet
      const rPick = Math.random();
      if (rPick < 0.70) {
        _tempColor.copy(colPrimary);
      } else if (rPick < 0.90) {
        _tempColor.copy(colSecondary);
      } else {
        _tempColor.copy(colAccent);
      }

      this._colors[i3] = _tempColor.r;
      this._colors[i3 + 1] = _tempColor.g;
      this._colors[i3 + 2] = _tempColor.b;

      // Lifetime: age = random start, maxLife = 3.0 to 7.0 seconds (reserved for future lifecycle features)
      this._lifetimes[i2] = Math.random() * 5.0;
      this._lifetimes[i2 + 1] = 4.0 + Math.random() * 3.0;
    }

    // 4. Create THREE.BufferGeometry with typed GPU attributes
    this._geometry = new THREE.BufferGeometry();
    this._geometry.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    this._geometry.setAttribute('aVelocity', new THREE.BufferAttribute(this._velocities, 3));
    this._geometry.setAttribute('aPhase', new THREE.BufferAttribute(this._phases, 1));
    this._geometry.setAttribute('aSize', new THREE.BufferAttribute(this._sizes, 1));
    this._geometry.setAttribute('aColor', new THREE.BufferAttribute(this._colors, 3));
    this._geometry.setAttribute('aLifetime', new THREE.BufferAttribute(this._lifetimes, 2));

    // Instantaneous O(1) zero-allocation active particle count control
    this._geometry.setDrawRange(0, this._count);

    // 5. Create ShaderMaterial
    this._material = ParticleShaders.createMaterial({
      dpr: baseDpr,
      baseSize: options.baseSize || this._cfg.baseSize || 11.0,
      gpuMotion: this._simulationMode === 'gpu',
      opacity: this._cfg.opacity || 0.92
    });

    // 6. Create THREE.Points mesh and mount to scene
    this._points = new THREE.Points(this._geometry, this._material);
    // Explicitly bypass CPU frustum culling: procedural GPU vertex displacement and
    // screen-space point attenuation make static CPU geometry bounding spheres unsuitable.
    this._points.frustumCulled = false;
    this._points.name = 'nexus_gpu_particles';
    this._points.renderOrder = (this._cfg.rendering && this._cfg.rendering.renderOrder) || 2;
    this._points.visible = this._visible;

    if (this._parentScene) {
      this._parentScene.add(this._points);
    }

    // 7. Subscribe to EventBus transitions
    this._setupEventListeners();

    // 8. Synchronize with StateManager
    if (stateManager?.state?.rendering?.particles) {
      stateManager.state.rendering.particles.visible = this._visible;
      stateManager.state.rendering.particles.count = this._count;
      if (stateManager.state.rendering.particles.forceField) {
        stateManager.state.rendering.particles.forceField.mode = this._forceField.mode;
        stateManager.state.rendering.particles.forceField.active = false;
        stateManager.state.rendering.particles.forceField.radius = this._forceField.radius;
        stateManager.state.rendering.particles.forceField.strength = this._forceField.strength;
      }
      if (stateManager.state.rendering.particles.handInteraction) {
        stateManager.state.rendering.particles.handInteraction.enabled = this._handInteractionEnabled;
        stateManager.state.rendering.particles.handInteraction.left.mode = this._hands.left.mode;
        stateManager.state.rendering.particles.handInteraction.right.mode = this._hands.right.mode;
      }
    }

    this._isInitialized = true;
    return this;
  }

  /**
   * Subscribe to relevant system and mode events
   * @private
   */
  _setupEventListeners() {
    // Mode transitions (Hologram vs Particle vs Energy)
    const onModeChange = ({ mode }) => {
      if (mode === 'particle') {
        this.setSimulationMode('gpu');
        this.setCount(Math.min(this._capacity, Math.max(6000, this._count)));
      }
    };
    eventBus.on(Events.MODE_CHANGE, onModeChange);
    this._unsubscribers.push(() => eventBus.off(Events.MODE_CHANGE, onModeChange));

    // DPR / resolution scale adjustments
    const onResScaleChange = ({ dpr }) => {
      if (this._material && this._material.uniforms?.uDpr) {
        this._material.uniforms.uDpr.value = dpr;
      }
    };
    eventBus.on(Events.RES_SCALE_CHANGE, onResScaleChange);
    this._unsubscribers.push(() => eventBus.off(Events.RES_SCALE_CHANGE, onResScaleChange));

    // Command listener: Particle count (prevents loops with source check)
    const onParticleCount = (payload) => {
      if (payload && payload.source === 'engine') return;
      if (payload && typeof payload.count === 'number') {
        this.setCount(payload.count, 'event');
      }
    };
    eventBus.on(Events.PARTICLE_COUNT, onParticleCount);
    this._unsubscribers.push(() => eventBus.off(Events.PARTICLE_COUNT, onParticleCount));

    // Command listener: Particle visibility (prevents loops with source check)
    const onParticleVisibility = (payload) => {
      if (payload && payload.source === 'engine') return;
      if (payload && typeof payload.visible === 'boolean') {
        this.setVisible(payload.visible, 'event');
      }
    };
    eventBus.on(Events.PARTICLE_VISIBILITY, onParticleVisibility);
    this._unsubscribers.push(() => eventBus.off(Events.PARTICLE_VISIBILITY, onParticleVisibility));

    // Command listener: Particle quality preset (prevents loops with source check)
    const onParticleQuality = (payload) => {
      if (payload && payload.source === 'engine') return;
      if (payload && typeof payload.quality === 'string') {
        this.setQuality(payload.quality, 'event');
      }
    };
    eventBus.on(Events.PARTICLE_QUALITY, onParticleQuality);
    this._unsubscribers.push(() => eventBus.off(Events.PARTICLE_QUALITY, onParticleQuality));

    // Command listener: Particle force field (prevents loops with source check)
    const onParticleForceField = (payload) => {
      if (payload && payload.source === 'engine') return;
      if (!payload) return;
      if (payload.mode === 'clear' || payload.mode === 'none') {
        this.clearForceField('event');
      } else if (payload.mode === 'attract') {
        this.setAttractor(payload.position, payload, 'event');
      } else if (payload.mode === 'repel') {
        this.setRepulsor(payload.position, payload, 'event');
      } else if (payload.position) {
        this.updateForceField(payload.position, payload, 'event');
      }
    };
    eventBus.on(Events.PARTICLE_FORCE_FIELD, onParticleForceField);
    this._unsubscribers.push(() => eventBus.off(Events.PARTICLE_FORCE_FIELD, onParticleForceField));

    // Command listener: Particle hand interaction (prevents loops with source check)
    const onParticleHandInteraction = (payload) => {
      if (payload && payload.source === 'engine') return;
      if (!payload || !payload.hand) return;
      if (payload.enabled !== undefined) {
        this.setHandInteractionEnabled(payload.enabled, 'event');
      }
      if (payload.mode) {
        this.setHandMode(payload.hand, payload.mode, 'event');
      }
      if (payload.radius !== undefined || payload.strength !== undefined) {
        this.setHandForceField(payload.hand, payload, 'event');
      }
    };
    eventBus.on(Events.PARTICLE_HAND_INTERACTION, onParticleHandInteraction);
    this._unsubscribers.push(() => eventBus.off(Events.PARTICLE_HAND_INTERACTION, onParticleHandInteraction));
  }

  /**
   * Update hand-controlled particle force fields from tracked 3D hand controllers or landmarks.
   * Zero heap allocations inside 60 FPS animation loop.
   *
   * @param {Object} controllersOrHands - Object containing { left, right } controllers or hands
   * @param {number} dt - Frame delta time in seconds
   * @param {number} currentTimeMs - High-resolution timestamp in ms
   */
  updateHandInteraction(controllersOrHands, dt, currentTimeMs) {
    if (!this._isInitialized || !this._handInteractionEnabled || !controllersOrHands) return;

    const graceMs = this._handCfg.trackingLossGraceMs || 150;
    const anchor = this._handCfg.anchorPoint || 'position';

    const leftSource = controllersOrHands.left;
    const rightSource = controllersOrHands.right;
    const leftDetected = Boolean(leftSource && leftSource.detected);
    const rightDetected = Boolean(rightSource && rightSource.detected);
    const singleHandActive = (leftDetected && !rightDetected) || (rightDetected && !leftDetected);

    for (const side of ['left', 'right']) {
      const source = controllersOrHands[side];
      const h = this._hands[side];
      const isDetected = Boolean(source && source.detected);

      if (isDetected) {
        h.lastSeenTime = currentTimeMs;
        const wasLost = !h.detected;
        h.detected = true;

        // Resolve 3D anchor position
        if (anchor === 'palm' && source.palmCenter) {
          h.targetPosition.copy(source.palmCenter);
        } else if (anchor === 'indexTip') {
          if (source.indexTip) h.targetPosition.copy(source.indexTip);
          else if (source.landmarks && source.landmarks[8]) h.targetPosition.copy(source.landmarks[8]);
          else if (source.position) h.targetPosition.copy(source.position);
        } else {
          // Default: 'position' (cursor/pinch point or position)
          if (source.position) h.targetPosition.copy(source.position);
          else if (source.palmCenter) h.targetPosition.copy(source.palmCenter);
        }

        // Reacquisition: snap position immediately if weight was fully faded to avoid sweeping
        if (wasLost && h.weight < 0.05) {
          h.position.copy(h.targetPosition);
        }

        // Determine effective mode for this hand
        let effectiveMode = h.targetMode;
        if (singleHandActive && this._handCfg.singleHandMode) {
          effectiveMode = this._handCfg.singleHandMode;
        }

        h.mode = effectiveMode;
        if (effectiveMode === 'none') {
          h.targetWeight = 0.0;
          h.targetStrength = 0.0;
        } else {
          h.targetWeight = 1.0;
          const defaultStrength = effectiveMode === 'attract' ? h.attractStrength : h.repelStrength;
          h.targetStrength = defaultStrength;
        }
      } else {
        // Tracking not detected in current frame
        const elapsedSinceSeen = currentTimeMs - h.lastSeenTime;
        if (elapsedSinceSeen > graceMs) {
          // Grace period elapsed -> mark as lost and smoothly fade weight to zero
          h.detected = false;
          h.targetWeight = 0.0;
          h.targetStrength = 0.0;
        }
        // If within grace period, maintain previous targetPosition and targetWeight
      }
    }
  }

  /**
   * Per-frame zero-allocation update loop called in primary 60 FPS animation loop.
   *
   * @param {number} time - Elapsed time in seconds
   * @param {number} dt - Frame delta time in seconds
   */
  update(time, dt) {
    if (!this._isInitialized || !this._visible) return;

    // 1. Smoothly interpolate manual force-field active weight and parameters (Phase 5, Step 5.2)
    const ff = this._forceField;
    const alphaFF = 1.0 - Math.exp(-ff.smoothing * dt);

    ff.weight += (ff.targetWeight - ff.weight) * alphaFF;
    ff.strength += (ff.targetStrength - ff.strength) * alphaFF;
    ff.radius += (ff.targetRadius - ff.radius) * alphaFF;
    ff.position.lerp(ff.targetPosition, alphaFF);

    if (ff.targetWeight === 0.0 && ff.weight < 0.001) {
      ff.weight = 0.0;
      ff.mode = 'none';
    } else {
      ff.mode = ff.targetMode;
    }

    // 2. Smoothly interpolate hand force fields (Phase 5, Step 5.3)
    const fadeSpeed = this._handCfg.fadeSpeed || 10.0;
    for (const side of ['left', 'right']) {
      const h = this._hands[side];
      const rate = h.targetWeight === 0.0 ? fadeSpeed : h.smoothing;
      const alphaH = 1.0 - Math.exp(-rate * dt);

      h.weight += (h.targetWeight - h.weight) * alphaH;
      h.strength += (h.targetStrength - h.strength) * alphaH;
      h.radius += (h.targetRadius - h.radius) * alphaH;
      h.position.lerp(h.targetPosition, alphaH);

      if (h.targetWeight === 0.0 && h.weight < 0.001) {
        h.weight = 0.0;
        h.active = false;
      } else {
        h.active = h.weight > 0.001;
      }
    }

    // 3. Update global shader simulation uniforms (zero heap allocations)
    const uniforms = this._material.uniforms;
    uniforms.uTime.value = time;
    uniforms.uGpuMotion.value = this._simulationMode === 'gpu' ? 1.0 : 0.0;

    // Field 1: Manual force field (Phase 5, Step 5.2 API: setAttractor, setRepulsor, etc.)
    uniforms.uForcePosition.value.copy(ff.position);
    uniforms.uForceRadius.value = ff.radius;
    uniforms.uForceStrength.value = ff.strength;
    uniforms.uForceFalloff.value = ff.falloff;
    uniforms.uForceMaxDist.value = ff.maxDisplacement;
    uniforms.uForceType.value = ff.mode === 'attract' ? 1.0 : (ff.mode === 'repel' ? -1.0 : 0.0);
    uniforms.uForceWeight.value = ff.weight;

    // Field 2: Left Hand (Phase 5, Step 5.3)
    const fLeft = this._handInteractionEnabled ? this._hands.left : null;
    if (fLeft && uniforms.uForce2Position) {
      uniforms.uForce2Position.value.copy(fLeft.position);
      uniforms.uForce2Radius.value = fLeft.radius;
      uniforms.uForce2Strength.value = fLeft.strength;
      uniforms.uForce2Falloff.value = fLeft.falloff;
      uniforms.uForce2MaxDist.value = fLeft.maxDisplacement;
      uniforms.uForce2Type.value = fLeft.mode === 'attract' ? 1.0 : (fLeft.mode === 'repel' ? -1.0 : 0.0);
      uniforms.uForce2Weight.value = fLeft.weight;
    } else if (uniforms.uForce2Weight) {
      uniforms.uForce2Weight.value = 0.0;
    }

    // Field 3: Right Hand (Phase 5, Step 5.3)
    const fRight = this._handInteractionEnabled ? this._hands.right : null;
    if (fRight && uniforms.uForce3Position) {
      uniforms.uForce3Position.value.copy(fRight.position);
      uniforms.uForce3Radius.value = fRight.radius;
      uniforms.uForce3Strength.value = fRight.strength;
      uniforms.uForce3Falloff.value = fRight.falloff;
      uniforms.uForce3MaxDist.value = fRight.maxDisplacement;
      uniforms.uForce3Type.value = fRight.mode === 'attract' ? 1.0 : (fRight.mode === 'repel' ? -1.0 : 0.0);
      uniforms.uForce3Weight.value = fRight.weight;
    } else if (uniforms.uForce3Weight) {
      uniforms.uForce3Weight.value = 0.0;
    }
  }

  /**
   * Update active particle count via zero-allocation GPU draw range
   * @param {number} count - Desired number of active particles
   * @param {string} [source='engine'] - Source identifier to prevent event loop recursion
   */
  setCount(count, source = 'engine') {
    const safeCount = Math.max(10, Math.min(Math.round(count), this._capacity));
    if (this._count === safeCount && this._geometry?.drawRange?.count === safeCount) return;
    this._count = safeCount;

    if (this._geometry) {
      this._geometry.setDrawRange(0, safeCount);
    }

    if (stateManager?.state?.rendering?.particles) {
      stateManager.state.rendering.particles.count = safeCount;
    }

    eventBus.emit(Events.PARTICLE_COUNT, { count: safeCount, source });
  }

  /**
   * Toggle or set particle system visibility
   * @param {boolean} visible
   * @param {string} [source='engine'] - Source identifier to prevent event loop recursion
   */
  setVisible(visible, source = 'engine') {
    const boolVisible = Boolean(visible);
    if (this._visible === boolVisible && (!this._points || this._points.visible === boolVisible)) return;
    this._visible = boolVisible;
    if (this._points) {
      this._points.visible = this._visible;
    }

    if (stateManager?.state?.rendering?.particles) {
      stateManager.state.rendering.particles.visible = this._visible;
    }

    eventBus.emit(Events.PARTICLE_VISIBILITY, { visible: this._visible, source });
  }

  /**
   * Set overall particle visual opacity [0.0, 1.0]
   * @param {number} opacity
   */
  setOpacity(opacity) {
    if (this._material && this._material.uniforms?.uOpacity) {
      this._material.uniforms.uOpacity.value = Math.max(0.0, Math.min(1.0, opacity));
    }
  }

  /**
   * Set base particle point size
   * @param {number} size
   */
  setBaseSize(size) {
    if (this._material && this._material.uniforms?.uBaseSize) {
      this._material.uniforms.uBaseSize.value = Math.max(1.0, size);
    }
  }

  /**
   * Toggle between GPU shader simulation mode and manual buffer mode
   * @param {'gpu'|'manual'} mode
   */
  setSimulationMode(mode) {
    this._simulationMode = mode;
    if (this._material && this._material.uniforms?.uGpuMotion) {
      this._material.uniforms.uGpuMotion.value = mode === 'gpu' ? 1.0 : 0.0;
    }
  }

  /**
   * Apply quality preset ('low' | 'medium' | 'high' | 'ultra')
   * @param {string} quality
   * @param {string} [source='engine'] - Source identifier to prevent event loop recursion
   */
  setQuality(quality, source = 'engine') {
    this._quality = quality;
    const presets = this._cfg.qualityPresets || {
      low: 1500,
      medium: 3000,
      high: 8000,
      ultra: Math.min(15000, this._capacity)
    };

    const targetCount = presets[quality] || presets.medium || 3000;
    this.setCount(targetCount, source);

    if (stateManager?.state?.rendering?.particles) {
      stateManager.state.rendering.particles.quality = quality;
    }

    eventBus.emit(Events.PARTICLE_QUALITY, { quality, count: this._count, source });
  }

  // =========================================================================
  // FORCE FIELD API (Phase 5, Step 5.2: Attraction & Repulsion)
  // =========================================================================

  /**
   * Activate an attraction force field pulling particles toward target coordinates.
   *
   * @param {THREE.Vector3|{x: number, y: number, z: number}} position - Center of attraction
   * @param {Object} [options={}] - Custom force overrides (strength, radius, falloff, maxDisplacement)
   * @param {string} [source='engine'] - Event source identifier
   * @returns {this}
   */
  setAttractor(position, options = {}, source = 'engine') {
    return this.setForceField('attract', position, options, source);
  }

  /**
   * Activate a repulsion force field pushing particles away from target coordinates.
   *
   * @param {THREE.Vector3|{x: number, y: number, z: number}} position - Center of repulsion
   * @param {Object} [options={}] - Custom force overrides (strength, radius, falloff, maxDisplacement)
   * @param {string} [source='engine'] - Event source identifier
   * @returns {this}
   */
  setRepulsor(position, options = {}, source = 'engine') {
    return this.setForceField('repel', position, options, source);
  }

  /**
   * Configure and activate or update a particle force field.
   *
   * @param {'attract'|'repel'|'none'} mode - Force field mode
   * @param {THREE.Vector3|{x: number, y: number, z: number}} [position] - Center coordinates
   * @param {Object} [options={}] - Optional parameter overrides
   * @param {string} [source='engine'] - Event source identifier
   * @returns {this}
   */
  setForceField(mode, position, options = {}, source = 'engine') {
    const ff = this._forceField;
    if (mode === 'none') {
      return this.clearForceField(source);
    }

    ff.targetMode = mode;
    if (position) {
      ff.targetPosition.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
      if (ff.weight < 0.01) {
        // Snap initial center on fresh activation to prevent cross-screen sweeps
        ff.position.copy(ff.targetPosition);
      }
    }

    const defaultStrength = mode === 'attract'
      ? (this._forceFieldCfg.attractStrength || 1.20)
      : (this._forceFieldCfg.repelStrength || 1.50);

    ff.targetStrength = options.strength !== undefined ? Math.max(0.0, options.strength) : defaultStrength;
    if (options.radius !== undefined) ff.targetRadius = Math.max(0.01, options.radius);
    if (options.falloff !== undefined) ff.falloff = Math.max(0.5, options.falloff);
    if (options.maxDisplacement !== undefined) ff.maxDisplacement = Math.max(0.1, options.maxDisplacement);

    ff.targetWeight = 1.0;

    this._syncForceFieldState(source);
    return this;
  }

  /**
   * Smoothly update force-field target position and optional parameters without mode changes.
   *
   * @param {THREE.Vector3|{x: number, y: number, z: number}} position - New center coordinates
   * @param {Object} [options={}] - Optional strength/radius adjustments
   * @param {string} [source='engine'] - Event source identifier
   * @returns {this}
   */
  updateForceField(position, options = {}, source = 'engine') {
    const ff = this._forceField;
    if (ff.targetMode === 'none') return this;

    if (position) {
      ff.targetPosition.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
    }
    if (options.strength !== undefined) ff.targetStrength = Math.max(0.0, options.strength);
    if (options.radius !== undefined) ff.targetRadius = Math.max(0.01, options.radius);

    this._syncForceFieldState(source);
    return this;
  }

  /**
   * Smoothly deactivate the active force field with zero abrupt particle snaps.
   *
   * @param {string} [source='engine'] - Event source identifier
   * @returns {this}
   */
  clearForceField(source = 'engine') {
    const ff = this._forceField;
    ff.targetMode = 'none';
    ff.targetWeight = 0.0;
    ff.targetStrength = 0.0;

    this._syncForceFieldState(source);
    return this;
  }

  /**
   * Synchronize active force field state with StateManager and EventBus
   * @private
   */
  _syncForceFieldState(source = 'engine') {
    const ff = this._forceField;
    if (stateManager?.state?.rendering?.particles?.forceField) {
      const sff = stateManager.state.rendering.particles.forceField;
      sff.mode = ff.targetMode;
      sff.active = ff.targetWeight > 0.0;
      sff.radius = ff.targetRadius;
      sff.strength = ff.targetStrength;
    }

    eventBus.emit(Events.PARTICLE_FORCE_FIELD, {
      mode: ff.targetMode,
      active: ff.targetWeight > 0.0,
      position: { x: ff.targetPosition.x, y: ff.targetPosition.y, z: ff.targetPosition.z },
      radius: ff.targetRadius,
      strength: ff.targetStrength,
      source
    });
  }

  /**
   * Inspect current force field state
   * @returns {Object}
   */
  getForceFieldState() {
    const ff = this._forceField;
    return {
      enabled: ff.enabled,
      mode: ff.mode,
      targetMode: ff.targetMode,
      weight: ff.weight,
      active: ff.weight > 0.001 || ff.targetWeight > 0.0,
      position: { x: ff.position.x, y: ff.position.y, z: ff.position.z },
      targetPosition: { x: ff.targetPosition.x, y: ff.targetPosition.y, z: ff.targetPosition.z },
      radius: ff.radius,
      strength: ff.strength,
      falloff: ff.falloff,
      maxDisplacement: ff.maxDisplacement
    };
  }

  // =========================================================================
  // HAND INTERACTION API (Phase 5, Step 5.3: Hand-Controlled Particle Movement)
  // =========================================================================

  /**
   * Set force mode for a specific hand ('left' | 'right')
   * @param {'left'|'right'} hand
   * @param {'attract'|'repel'|'none'} mode
   * @param {string} [source='engine']
   * @returns {this}
   */
  setHandMode(hand, mode, source = 'engine') {
    if (hand !== 'left' && hand !== 'right') return this;
    const h = this._hands[hand];
    if (!h) return this;
    h.targetMode = mode;
    h.mode = mode;

    if (mode === 'none') {
      h.targetWeight = 0.0;
      h.targetStrength = 0.0;
    } else if (h.detected) {
      h.targetWeight = 1.0;
      h.targetStrength = mode === 'attract'
        ? (this._handCfg.attractStrength || 1.20)
        : (this._handCfg.repelStrength || 1.50);
    }

    this._syncHandInteractionState(hand, source);
    return this;
  }

  /**
   * Configure force-field parameters for a specific hand
   * @param {'left'|'right'} hand
   * @param {Object} [options={}]
   * @param {string} [source='engine']
   * @returns {this}
   */
  setHandForceField(hand, options = {}, source = 'engine') {
    if (hand !== 'left' && hand !== 'right') return this;
    const h = this._hands[hand];
    if (!h) return this;

    if (options.mode) {
      h.targetMode = options.mode;
      h.mode = options.mode;
    }
    if (options.radius !== undefined) h.targetRadius = Math.max(0.01, options.radius);
    if (options.strength !== undefined) h.targetStrength = Math.max(0.0, options.strength);
    if (options.attractStrength !== undefined) h.attractStrength = Math.max(0.0, options.attractStrength);
    if (options.repelStrength !== undefined) h.repelStrength = Math.max(0.0, options.repelStrength);
    if (options.falloff !== undefined) h.falloff = Math.max(0.5, options.falloff);
    if (options.maxDisplacement !== undefined) h.maxDisplacement = Math.max(0.1, options.maxDisplacement);

    this._syncHandInteractionState(hand, source);
    return this;
  }

  /**
   * Toggle hand-controlled particle interaction
   * @param {boolean} enabled
   * @param {string} [source='engine']
   * @returns {this}
   */
  setHandInteractionEnabled(enabled, source = 'engine') {
    this._handInteractionEnabled = Boolean(enabled);
    if (!this._handInteractionEnabled) {
      this._hands.left.targetWeight = 0.0;
      this._hands.left.targetStrength = 0.0;
      this._hands.right.targetWeight = 0.0;
      this._hands.right.targetStrength = 0.0;
    }
    this._syncHandInteractionState('both', source);
    return this;
  }

  /**
   * Check whether hand-controlled particle interaction is enabled
   * @returns {boolean}
   */
  isHandInteractionEnabled() {
    return this._handInteractionEnabled;
  }

  /**
   * Inspect current force state for a specific hand
   * @param {'left'|'right'} hand
   * @returns {Object|null}
   */
  getHandForceState(hand) {
    if (hand !== 'left' && hand !== 'right') return null;
    const h = this._hands[hand];
    return {
      hand,
      enabled: this._handInteractionEnabled,
      detected: h.detected,
      active: h.active,
      mode: h.mode,
      targetMode: h.targetMode,
      weight: h.weight,
      position: { x: h.position.x, y: h.position.y, z: h.position.z },
      targetPosition: { x: h.targetPosition.x, y: h.targetPosition.y, z: h.targetPosition.z },
      radius: h.radius,
      strength: h.strength,
      attractStrength: h.attractStrength,
      repelStrength: h.repelStrength,
      falloff: h.falloff,
      maxDisplacement: h.maxDisplacement
    };
  }

  /**
   * Synchronize active hand interaction state with StateManager and EventBus
   * @private
   * @param {'left'|'right'|'both'} hand
   * @param {string} [source='engine']
   */
  _syncHandInteractionState(hand = 'both', source = 'engine') {
    if (stateManager?.updateParticleHand) {
      if (hand === 'left' || hand === 'both') {
        stateManager.updateParticleHand('left', {
          active: this._hands.left.active,
          detected: this._hands.left.detected,
          mode: this._hands.left.mode,
          radius: this._hands.left.radius,
          strength: this._hands.left.strength,
          position: this._hands.left.position
        });
      }
      if (hand === 'right' || hand === 'both') {
        stateManager.updateParticleHand('right', {
          active: this._hands.right.active,
          detected: this._hands.right.detected,
          mode: this._hands.right.mode,
          radius: this._hands.right.radius,
          strength: this._hands.right.strength,
          position: this._hands.right.position
        });
      }
    }

    eventBus.emit(Events.PARTICLE_HAND_INTERACTION, {
      hand,
      enabled: this._handInteractionEnabled,
      left: this.getHandForceState('left'),
      right: this.getHandForceState('right'),
      source
    });
  }

  /**
   * Raw position attribute accessor for external integrations
   * @returns {Float32Array|null}
   */
  getPositions() {
    return this._positions;
  }

  /**
   * Raw velocity attribute accessor for external integrations
   * @returns {Float32Array|null}
   */
  getVelocities() {
    return this._velocities;
  }

  /**
   * Raw phase attribute accessor
   * @returns {Float32Array|null}
   */
  getPhases() {
    return this._phases;
  }

  /**
   * Mark positions buffer dirty when updated from external source
   */
  markPositionNeedsUpdate() {
    if (this._geometry && this._geometry.attributes.position) {
      this._geometry.attributes.position.needsUpdate = true;
    }
  }

  /**
   * Cleanly dispose all GPU resources, geometries, materials, and listeners
   */
  dispose() {
    // Unsubscribe from events
    for (const unsub of this._unsubscribers) {
      try { unsub(); } catch (e) {}
    }
    this._unsubscribers = [];

    // Remove from scene
    if (this._parentScene && this._points) {
      this._parentScene.remove(this._points);
    }

    // Dispose GPU buffers
    if (this._geometry) {
      this._geometry.dispose();
      this._geometry = null;
    }

    // Dispose shader material
    if (this._material) {
      this._material.dispose();
      this._material = null;
    }

    this._points = null;
    this._positions = null;
    this._velocities = null;
    this._phases = null;
    this._sizes = null;
    this._colors = null;
    this._lifetimes = null;
    this._forceField.mode = 'none';
    this._forceField.targetMode = 'none';
    this._forceField.weight = 0.0;
    this._forceField.targetWeight = 0.0;
    this._hands.left.weight = 0.0;
    this._hands.left.targetWeight = 0.0;
    this._hands.left.active = false;
    this._hands.left.detected = false;
    this._hands.right.weight = 0.0;
    this._hands.right.targetWeight = 0.0;
    this._hands.right.active = false;
    this._hands.right.detected = false;
    this._isInitialized = false;
  }
}

/**
 * Singleton instance of ParticleEngine
 */
export const particleEngine = new ParticleEngine();

// Safe global debug reference for browser console inspection
if (typeof window !== 'undefined' && !window.particleEngine) {
  window.particleEngine = particleEngine;
}
