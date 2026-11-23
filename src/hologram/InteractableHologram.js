/**
 * PROJECT NEXUS — Interactable Holographic Object
 * Interactive 3D entity responding to dual-hand pointing, proximity hover,
 * pinch-selection, natural release, and gestural activation.
 *
 * Responsibilities:
 * - Extends HologramObject base lifecycle and cascading opacity hierarchy.
 * - Manages discrete interaction states: 'IDLE', 'HOVERED', 'SELECTED', 'ACTIVATED'.
 * - Provides analytical bounding sphere for zero-allocation proximity hit testing.
 * - Dynamic visual state feedback:
 *   - IDLE: Ambient wireframe rotation, subtle breathing pulse, base blue tint.
 *   - HOVERED: Smooth 1.10x scale expansion, hand-specific color illumination (Cyan/Violet),
 *     and targeting reticle bracket engagement.
 *   - SELECTED: 1.18x lock-in scale, luminous sky blue highlight, firm reticle alignment,
 *     and smooth pinch-and-drag translation.
 *   - ACTIVATED: 1.35x kinetic scale punch, emerald pulse flash, and action payload invocation.
 * - Guarantees zero heap allocations per frame in the 60 FPS animation loop.
 *
 * @module hologram/InteractableHologram
 */

import * as THREE from 'three';
import { HologramObject } from './HologramObject.js';
import { HologramMaterials } from './HologramMaterials.js';
import { HologramEffects } from './HologramEffects.js';
import { AppConfig } from '../config/AppConfig.js';
import { expDecayAlpha, clamp, lerp } from '../utils/MathUtils.js';

// Pre-allocated scratch objects for zero-allocation per-frame interpolation
const _scratchColor = new THREE.Color();
const _targetColor = new THREE.Color();
const _targetPos = new THREE.Vector3();

export class InteractableHologram extends HologramObject {
  /**
   * @param {string} id - Unique identifier
   * @param {Object} [options]
   * @param {string} [options.type='prism'] - 'prism' | 'cube' | 'orb'
   * @param {string} [options.label='HOLO WIDGET'] - Descriptive display label
   * @param {THREE.Vector3|Array<number>} [options.position] - Spawn world coordinates
   * @param {number} [options.interactionRadius=0.35] - Analytical hit-test bounding sphere radius
   * @param {boolean} [options.isDraggable=true] - Whether pinch-and-drag translation is enabled
   * @param {Function} [options.onActivate] - Callback invoked when object action is activated
   */
  constructor(id, options = {}) {
    super(id);

    this.type = options.type || 'prism';
    this.label = options.label || 'HOLO WIDGET';
    this.interactionRadius = options.interactionRadius !== undefined ? options.interactionRadius : 0.38;
    this.isDraggable = options.isDraggable !== false;
    this.onActivate = options.onActivate || null;

    this._cfg = AppConfig.interaction.objects;
    this._manipCfg = AppConfig.interaction?.manipulation?.twoHand;

    // Interaction state
    this.state = 'IDLE'; // 'IDLE' | 'HOVERED' | 'SELECTED' | 'ACTIVATED'
    this.hoveringHand = null; // 'left' | 'right' | null
    this.selectingHand = null; // 'left' | 'right' | null

    // Transform tracking & drag offsets (pre-allocated)
    this.initialPosition = new THREE.Vector3();
    if (options.position) {
      if (Array.isArray(options.position)) {
        this.position.set(options.position[0], options.position[1], options.position[2]);
      } else if (options.position instanceof THREE.Vector3) {
        this.position.copy(options.position);
      }
    }
    this.initialPosition.copy(this.position);
    this.dragOffset = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3().copy(this.position);

    // Persistent user-controlled transform channels (RST manipulation)
    this.userScale = 1.0;
    this.targetUserScale = 1.0;
    this.userRotation = new THREE.Euler(0, 0, 0);
    this.targetUserRotation = new THREE.Euler(0, 0, 0);

    // Animation & interpolation variables
    this.currentScale = 1.0;
    this.targetScale = 1.0;
    this.currentColor = new THREE.Color(this._cfg.colors.idle);
    this.rotationSpeed = 0.8;
    this.spinBoost = 0.0;
    this.activationTime = 0;
    this.reticleAlpha = 0.0;
    this.targetReticleAlpha = 0.0;
    this._lastUpdateFrameTime = -1;

    // Build specialized 3D geometries and materials
    this._buildMeshHierarchy();
  }

  /**
   * Build multi-layered holographic geometry based on entity type
   * @private
   */
  _buildMeshHierarchy() {
    const r = this.interactionRadius * 0.72;

    // 1. Core Visual Geometry (Type-dependent)
    let coreGeo, outerGeo;
    if (this.type === 'prism') {
      coreGeo = new THREE.OctahedronGeometry(r, 0);
      outerGeo = new THREE.TorusGeometry(r * 1.35, 0.008, 16, 48);
    } else if (this.type === 'cube') {
      coreGeo = new THREE.BoxGeometry(r * 1.25, r * 1.25, r * 1.25);
      outerGeo = new THREE.BoxGeometry(r * 1.65, r * 1.65, r * 1.65);
    } else {
      // 'orb' default
      coreGeo = new THREE.IcosahedronGeometry(r, 1);
      outerGeo = new THREE.SphereGeometry(r * 1.30, 16, 12);
    }

    // Dynamic wireframe materials
    this._coreMaterial = HologramMaterials.createWireframeMaterial({
      color: this._cfg.colors.idle,
      opacity: 0.70
    });
    this.trackMaterial(this._coreMaterial);

    this._outerMaterial = HologramMaterials.createWireframeMaterial({
      color: this._cfg.colors.idle,
      opacity: 0.35
    });
    this.trackMaterial(this._outerMaterial);

    this._coreMesh = new THREE.Mesh(coreGeo, this._coreMaterial);
    this._coreMesh.frustumCulled = false;
    this.add(this._coreMesh);

    this._outerMesh = new THREE.Mesh(outerGeo, this._outerMaterial);
    this._outerMesh.frustumCulled = false;
    this.add(this._outerMesh);

    // 2. Interactive Sci-Fi Targeting Brackets / Reticle Ring
    this._buildTargetingReticle(r * 1.55);
  }

  /**
   * Construct 4-corner holographic targeting brackets around interactable object
   * @private
   * @param {number} radius
   */
  _buildTargetingReticle(radius) {
    this._reticleGroup = new THREE.Group();
    this._reticleGroup.name = `${this.id}_reticle`;

    const bracketSize = radius * 0.35;
    const bracketMat = HologramMaterials.createLineMaterial({
      color: this._cfg.colors.selected,
      opacity: 0.0
    });
    this.trackMaterial(bracketMat);
    this._reticleMaterial = bracketMat;

    // Build 4 L-shaped corner brackets in the XY plane
    const corners = [
      { x: -radius, y: radius, dx: bracketSize, dy: -bracketSize },   // Top-Left
      { x: radius, y: radius, dx: -bracketSize, dy: -bracketSize },   // Top-Right
      { x: -radius, y: -radius, dx: bracketSize, dy: bracketSize },   // Bottom-Left
      { x: radius, y: -radius, dx: -bracketSize, dy: bracketSize }    // Bottom-Right
    ];

    corners.forEach((c) => {
      const points = [
        new THREE.Vector3(c.x, c.y + c.dy, 0),
        new THREE.Vector3(c.x, c.y, 0),
        new THREE.Vector3(c.x + c.dx, c.y, 0)
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geo, bracketMat);
      line.frustumCulled = false;
      this._reticleGroup.add(line);
    });

    this.add(this._reticleGroup);
  }

  /**
   * Set hover state
   * @param {boolean} isHovered
   * @param {'left'|'right'|null} hand
   */
  setHover(isHovered, hand = null) {
    if (this.state === 'SELECTED' || this.state === 'ACTIVATED') return;

    if (isHovered) {
      this.state = 'HOVERED';
      this.hoveringHand = hand;
      this.targetScale = 1.10;
      this.targetReticleAlpha = 0.85;
    } else {
      this.state = 'IDLE';
      this.hoveringHand = null;
      this.targetScale = 1.0;
      this.targetReticleAlpha = 0.0;
    }
  }

  /**
   * Set selection state (pinch engagement)
   * @param {boolean} isSelected
   * @param {'left'|'right'|null} hand
   * @param {THREE.Vector3} [controllerPos] - Current position of selecting controller
   */
  setSelected(isSelected, hand = null, controllerPos = null) {
    if (isSelected) {
      this.state = 'SELECTED';
      this.selectingHand = hand;
      this.targetScale = 1.18;
      this.targetReticleAlpha = 1.0;

      if (controllerPos) {
        this.dragOffset.copy(this.position).sub(controllerPos);
      }
    } else {
      this.selectingHand = null;
      if (this.hoveringHand) {
        this.state = 'HOVERED';
        this.targetScale = 1.10;
        this.targetReticleAlpha = 0.85;
      } else {
        this.state = 'IDLE';
        this.targetScale = 1.0;
        this.targetReticleAlpha = 0.0;
      }
    }
  }

  /**
   * Drag object smoothly toward controller position
   * @param {THREE.Vector3} controllerPos
   * @param {number} dt
   */
  dragTo(controllerPos, dt) {
    if (!this.isDraggable || this.state !== 'SELECTED' && this.state !== 'ACTIVATED') return;

    _targetPos.copy(controllerPos).add(this.dragOffset);
    const alpha = expDecayAlpha(this._cfg.dragSmoothing || 22.0, dt);
    this.position.lerp(_targetPos, alpha);
  }

  /**
   * Activate object action via gesture
   * @param {'left'|'right'} hand
   * @param {string} gesture
   * @param {number} currentTimeMs
   */
  activate(hand, gesture, currentTimeMs) {
    this.state = 'ACTIVATED';
    this.targetScale = 1.35;
    this.spinBoost = 7.5;
    this.activationTime = currentTimeMs;
    this.targetReticleAlpha = 1.0;

    if (typeof this.onActivate === 'function') {
      try {
        this.onActivate(this, hand, gesture);
      } catch (err) {
        console.warn(`[InteractableHologram] Error in onActivate for "${this.id}":`, err);
      }
    }
  }

  /**
   * Per-frame zero-allocation update loop
   * @param {number} time - Elapsed time in seconds
   * @param {number} dt - Frame delta time in seconds
   * @param {number} currentTimeMs - Timestamp in milliseconds
   */
  update(time, dt, currentTimeMs = 0) {
    if (this._lastUpdateFrameTime === time) return;
    this._lastUpdateFrameTime = time;

    const nowMs = currentTimeMs || (time * 1000);

    // 1. Decay activation pulse
    if (this.state === 'ACTIVATED') {
      if (nowMs - this.activationTime > 320) {
        this.state = this.selectingHand ? 'SELECTED' : (this.hoveringHand ? 'HOVERED' : 'IDLE');
        this.targetScale = this.state === 'SELECTED' ? 1.18 : (this.state === 'HOVERED' ? 1.10 : 1.0);
      }
    }

    // 2. Exponential scale interpolation (composed visual scale = state scale * user scale)
    const scaleAlpha = expDecayAlpha(this._cfg.hoverLerpSpeed || 14.0, dt);
    this.currentScale = lerp(this.currentScale, this.targetScale, scaleAlpha);

    const zoomSmoothing = (this._manipCfg && this._manipCfg.zoomSmoothing) || 18.0;
    const zoomAlpha = expDecayAlpha(zoomSmoothing, dt);
    this.userScale = lerp(this.userScale, this.targetUserScale, zoomAlpha);

    this.scale.setScalar(this.currentScale * this.userScale);

    // 3. User-controlled root orientation & inner mesh ambient spin
    const rotSmoothing = (this._manipCfg && this._manipCfg.rotationSmoothing) || 16.0;
    const rotAlpha = expDecayAlpha(rotSmoothing, dt);
    this.userRotation.x = lerp(this.userRotation.x, this.targetUserRotation.x, rotAlpha);
    this.userRotation.y = lerp(this.userRotation.y, this.targetUserRotation.y, rotAlpha);
    this.userRotation.z = lerp(this.userRotation.z, this.targetUserRotation.z, rotAlpha);
    this.rotation.copy(this.userRotation);

    const baseRot = this.state === 'SELECTED' ? 1.6 : (this.state === 'HOVERED' ? 1.2 : 0.6);
    this.spinBoost = Math.max(0.0, this.spinBoost - 12.0 * dt);
    const currentRotSpeed = (baseRot + this.spinBoost) * dt;

    if (this._coreMesh) {
      this._coreMesh.rotation.y += currentRotSpeed;
      this._coreMesh.rotation.x += currentRotSpeed * 0.65;
    }
    if (this._outerMesh) {
      this._outerMesh.rotation.y -= currentRotSpeed * 0.75;
      this._outerMesh.rotation.z += currentRotSpeed * 0.50;
    }

    // 4. Reticle brackets rotation & opacity
    this.reticleAlpha = lerp(this.reticleAlpha, this.targetReticleAlpha, scaleAlpha);
    if (this._reticleMaterial) {
      this._reticleMaterial.opacity = this.reticleAlpha * this._opacity;
    }
    if (this._reticleGroup) {
      this._reticleGroup.rotation.z += (this.state === 'SELECTED' ? 2.4 : 0.8) * dt;
    }

    // 5. Dynamic color determination & smooth interpolation
    let targetHex = this._cfg.colors.idle;
    if (this.state === 'ACTIVATED') {
      targetHex = this._cfg.colors.activated;
    } else if (this.state === 'SELECTED') {
      targetHex = this._cfg.colors.selected;
    } else if (this.state === 'HOVERED') {
      targetHex = this.hoveringHand === 'left' ? this._cfg.colors.hoverLeft : this._cfg.colors.hoverRight;
    }

    _targetColor.setHex(targetHex);
    this.currentColor.lerp(_targetColor, scaleAlpha);

    if (this._coreMaterial) {
      this._coreMaterial.color.copy(this.currentColor);
    }
    if (this._outerMaterial) {
      this._outerMaterial.color.copy(this.currentColor);
    }
    if (this._reticleMaterial) {
      this._reticleMaterial.color.copy(this.currentColor);
    }
  }

  /**
   * Set target user scale factor clamped within configured limits
   * @param {number} scaleFactor
   * @param {boolean} [immediate=false]
   */
  setUserScale(scaleFactor, immediate = false) {
    const minS = (this._manipCfg && this._manipCfg.minScale) || 0.40;
    const maxS = (this._manipCfg && this._manipCfg.maxScale) || 2.80;
    this.targetUserScale = clamp(scaleFactor, minS, maxS);
    if (immediate) {
      this.userScale = this.targetUserScale;
    }
  }

  /**
   * Set target user rotation orientation
   * @param {THREE.Euler|number} eulerOrX - Euler object or X angle in radians
   * @param {number} [y=0] - Y angle in radians
   * @param {number} [z=0] - Z angle in radians
   * @param {boolean} [immediate=false]
   */
  setUserRotation(eulerOrX, y = 0, z = 0, immediate = false) {
    if (eulerOrX && typeof eulerOrX === 'object' && 'isEuler' in eulerOrX) {
      this.targetUserRotation.copy(eulerOrX);
    } else if (typeof eulerOrX === 'number') {
      this.targetUserRotation.set(eulerOrX, y, z);
    }
    if (immediate) {
      this.userRotation.copy(this.targetUserRotation);
      this.rotation.copy(this.userRotation);
    }
  }

  /**
   * Reset user-controlled scale and rotation to defaults
   * @param {boolean} [immediate=false]
   */
  resetUserTransforms(immediate = false) {
    this.targetUserScale = 1.0;
    this.targetUserRotation.set(0, 0, 0);
    if (immediate) {
      this.userScale = 1.0;
      this.userRotation.set(0, 0, 0);
      this.rotation.set(0, 0, 0);
    }
  }

  /**
   * Reset object position to initial spawn point and restore default user transforms
   */
  resetPosition() {
    this.position.copy(this.initialPosition);
    this.targetPosition.copy(this.initialPosition);
    this.resetUserTransforms(true);
  }

  /**
   * Clean up WebGL resources
   */
  dispose() {
    if (this._coreMesh) {
      if (this._coreMesh.geometry) this._coreMesh.geometry.dispose();
      this.remove(this._coreMesh);
    }
    if (this._outerMesh) {
      if (this._outerMesh.geometry) this._outerMesh.geometry.dispose();
      this.remove(this._outerMesh);
    }
    if (this._reticleGroup) {
      this._reticleGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
      });
      this.remove(this._reticleGroup);
    }
    super.dispose();
  }
}
