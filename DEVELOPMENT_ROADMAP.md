# PROJECT NEXUS — DEVELOPMENT ROADMAP
**Project:** PROJECT NEXUS — Browser-Based Spatial 3D Gesture Experience  
**Total Phases:** 8 Phases  
**Total Steps:** 32 Steps (4 Steps per Phase)  
**Current Milestone:** Phase 5, Step 5.2 Implementation Complete (Manual Verification Pending)  

---

## Roadmap Overview

```
Phase 1: Project Foundation & Architecture  ────────► [COMPLETED] (Steps 1.1-1.4: All Completed)
Phase 2: Webcam & Hand Tracking System      ────────► [COMPLETED] (Steps 2.1-2.4: Implementation Completed)
Phase 3: Gesture Recognition Engine         ────────► [COMPLETED / IN PROGRESS] (Steps 3.1-3.3 Implemented; Step 3.4 Pending)
Phase 4: 3D Holographic Interface           ────────► [IN PROGRESS] (Steps 4.1-4.4 Implemented; Manual Verification Pending)
Phase 5: Particle Physics & Interaction     ────────► [IN PROGRESS] (Steps 5.1-5.2 Implemented; Steps 5.3-5.4 Pending)
Phase 6: Superpower & Visual Effects Engine ────────► [PENDING]
Phase 7: Advanced JARVIS Features           ────────► [PENDING]
Phase 8: Optimization, Quality & Release    ────────► [PENDING]
```

---

## Phase 1: Project Foundation & Architecture

### Step 1.1: Workspace Inspection & Architecture Planning
- **Status:** **[COMPLETED]**
- **Objectives:**
  - Complete non-destructive inspection of existing project structure and code assets.
  - Formulate modular architecture plan across all 12 system modules.
  - Define inter-module communication model and data flow pipeline.
  - Design scalable project folder structure preserving existing prototype files.
  - Produce comprehensive `PROJECT_ARCHITECTURE.md` and `DEVELOPMENT_ROADMAP.md`.
- **Deliverables:**
  - `PROJECT_ARCHITECTURE.md` (Initial baseline v1.0.0)
  - `DEVELOPMENT_ROADMAP.md` (Master 8-phase / 32-step roadmap)
- **Verification Criteria:**
  - All existing code (`index.html`, `README.md`) preserved without modification or deletion.
  - Architecture fully documents browser-first WebGL 2, Three.js, MediaPipe, Web Audio, and Web Speech standards.

### Step 1.2: Technology Setup & Dependency Configuration
- **Status:** **[COMPLETED]**
- **Objectives:**
  - Inspect all existing imports, dependency versions, and CDN resources.
  - Verify Three.js 0.160.0 core and Addons compatibility via `<script type="importmap">`.
  - Verify MediaPipe Tasks Vision 0.10.14 JS bundle, WASM assets, and float16 model task binary configuration.
  - Confirm browser-first, zero-install dependency strategy without unnecessary build tools (npm/Vite).
  - Document browser compatibility requirements and local development server configurations.
  - Update `PROJECT_ARCHITECTURE.md` and `DEVELOPMENT_ROADMAP.md` with confirmed dependency specifications.
- **Deliverables:**
  - Updated `PROJECT_ARCHITECTURE.md` (v1.1.0)
  - Updated `DEVELOPMENT_ROADMAP.md`
- **Verification Criteria:**
  - Pinned versions verified; no duplicate Three.js instances; browser-first execution preserved; zero code breakage.

### Step 1.3: Core Application Layout & Futuristic UI Foundation
- **Status:** **[COMPLETED]**
- **Objectives:**
  - Establish modular viewport canvas structure, responsive HUD layout, and sci-fi aesthetic styling.
  - Implement core layout container, typography, and status indicators.
  - Setup high-DPI canvas mounting and coordinate frame foundation.
  - Design 5 distinct spatial HUD regions (Main Viewport, System Header, Left Control Panel, Central Experience Area, Right Telemetry Panel, Bottom Control Bar).
  - Implement futuristic dark navy and cyan design tokens with glassmorphism.
- **Deliverables:**
  - `styles/main.css` (Base reset, canvas layers, status pill, loading screen, CSS custom properties)
  - `styles/hud.css` (HUD grid layout, header, experience mode cards, telemetry panel, responsive breakpoints)
  - Updated `index.html` (Spatial HUD DOM integration, live telemetry bindings, mode card state handling)
- **Verification Criteria:**
  - Responsive, high-contrast holographic layout rendering cleanly across viewport sizes (320px to 1440px+).
  - Full backward compatibility: all existing Three.js canvases, video elements, MediaPipe loops, and mouse fallback functioning without disruption.

### Step 1.4: Configuration, Reusable Components & Application State
- **Status:** **[COMPLETED]**
- **Objectives:**
  - Centralize application configuration constants and URLs into `src/config/AppConfig.js`.
  - Implement reactive global state store (`src/core/StateManager.js`) categorized across 6 logical domains with zero-allocation render loop performance.
  - Implement decoupled publish/subscribe event bus (`src/core/EventBus.js`) for typed lifecycle and mode events.
  - Implement reusable UI presentation controller (`src/ui/UIManager.js`) managing HUD, biometrics telemetry, notifications, and mode cards.
  - Implement pure spatial math utilities (`src/utils/MathUtils.js`) for coordinate projection and distance calculations.
  - Seamlessly integrate modules into `index.html` via browser-native ES module imports while preserving 100% existing functionality.
- **Deliverables:**
  - `src/config/AppConfig.js` (Centralized frozen configuration across 7 domains)
  - `src/core/EventBus.js` (Typed publish-subscribe event system)
  - `src/core/StateManager.js` (Domain-categorized state store with backward-compatible aliases)
  - `src/ui/UIManager.js` (Reusable UI manager for HUD, telemetry, notifications, and mode cards)
  - `src/utils/MathUtils.js` (Pure spatial math helpers: `dist3`, `clamp`, `lerp`, `screenToWorld`, `getFrustumSizeAt`)
  - Updated `index.html` (Modular ES module imports, decoupled event handling)
- **Verification Criteria:**
  - Centralized parameters accessible across modules; state transitions emit typed events reliably; 60 FPS zero-allocation performance preserved.

---

## Phase 2: Webcam & Hand Tracking System

### Step 2.1: Camera Manager & Stream Acquisition
- **Status:** **[COMPLETED]**
- **Objectives:**
  - Implement dedicated, reusable `src/camera/CameraManager.js` interfacing with `navigator.mediaDevices.getUserMedia()`.
  - Request optimal stream parameters ($1280 \times 720$ resolution, 60/30 FPS, user-facing) with cascading fallbacks.
  - Bind video feed to existing HTML `<video id="webcam-video">` element ensuring continuous Three.js `VideoTexture` synchronicity.
  - Gracefully handle permission denials, hardware errors, device disconnections, and camera switching.
  - Integrate cleanly with `StateManager` and `EventBus` (`Events.CAMERA_STATUS`, `Events.NOTIFICATION`).
- **Deliverables:**
  - `src/camera/CameraManager.js` (Clean CameraManager API: `init`, `start`, `stop`, `switchCamera`, `getStatus`, `dispose`)
  - Updated `src/config/AppConfig.js` (Dedicated camera configuration block)
  - Updated `src/core/StateManager.js` (Enhanced `setCameraState` with detailed metadata support)
  - Updated `index.html` (Stream acquisition decoupled into `cameraManager`)
- **Verification Criteria:**
  - Webcam stream captured reliably at 60 FPS; video texture updates smoothly in WebGL; mouse fallback seamlessly disconnects media tracks and reconnects without page reloads.

### Step 2.2: MediaPipe HandLandmarker Integration (GPU with CPU Fallback)
- **Status:** **[COMPLETED]**
- **Objectives:**
  - Implement `src/tracking/HandTracker.js` initializing MediaPipe Tasks Vision `HandLandmarker`.
  - Configure dual-hand tracking (`numHands: 2`) with `runningMode: 'VIDEO'`.
  - Implement WebGL GPU acceleration with automatic fallback to CPU delegate on failure.
  - Implement frame throttling to process inference only on new camera frames.
  - Expose clean lifecycle: `init`, `initialize`, `detect`, `getLandmarks`, `getResults`, `getStatus`, `isReady`, `dispose`.
- **Deliverables:**
  - `src/tracking/HandTracker.js` (MediaPipe Tasks Vision integration & delegate management)
  - Updated `src/core/EventBus.js` (`Events.TRACKER_INITIALIZED`, `Events.TRACKER_ERROR`)
  - Updated `index.html` (MediaPipe detection extracted into `handTracker`)
- **Verification Criteria:**
  - Model loads asynchronously without blocking UI; dual-hand detection runs stably at 60 FPS in real time with GPU/CPU delegate transparency.

### Step 2.3: Two-Hand Landmark Processing & EMA Smoothing
- **Status:** **[COMPLETED]**
- **Objectives:**
  - Implement `src/tracking/LandmarkProcessor.js` to process landmarks for Left and Right hands simultaneously.
  - Implement horizontal mirroring ($u = 1.0 - x$) for natural mirror alignment.
  - Apply Exponential Moving Average (EMA) filtering ($\alpha = 1.0 - e^{-\text{emaAlpha} \cdot dt}$) to eliminate high-frequency jitter while preserving quick motions.
  - Implement immediate initial detection snap and tracking-loss grace management (`trackingLossGraceMs: 150`) to prevent coordinate jumps.
  - Implement robust handedness disambiguation for mirrored video feeds and sticky primary hand arbitration with hysteresis.
  - Calculate palm center centroids, hand speeds, hand bounding spheres, and coordinate synchronizations.
  - Implement Mouse Fallback synthetic landmark integration.
- **Deliverables:**
  - `src/tracking/LandmarkProcessor.js` (Singleton & LandmarkProcessor class with zero allocations in 60 FPS loop)
  - Updated `src/config/AppConfig.js` (`maxHands: 2`, `trackingLossGraceMs: 150`, `primaryHandPreference: 'right'`)
  - Updated `src/core/StateManager.js` (`state.tracking.hands.left`, `state.tracking.hands.right`, `updateTwoHandTracking`)
  - Updated `src/ui/UIManager.js` (Support for dual-tracking telemetry indicators)
  - Updated `index.html` (Integrated landmarkProcessor into main 60 FPS rendering loop)
- **Verification Criteria:**
  - Independent smoothing active for both hands; zero GC pauses at 60 FPS; seamless primary hand fallback keeps single-hand gestures, raymarching, and particle systems fully intact.

### Step 2.4: 3D Coordinate Projection & Biomechanical Metrics
- **Status:** **[COMPLETED]**
- **Objectives:**
  - Map 2D normalized viewport coordinates into 3D Three.js world space coordinates using camera frustum geometry.
  - Implement vector-based interior joint angle calculations for all 15 hand joints (Thumb, Index, Middle, Ring, Pinky).
  - Compute anatomical joint flexion angles, normalized finger curl [0, 1], and finger extension [0, 1].
  - Calculate normalized outward palmar normal vector with handedness orientation awareness.
  - Compute palm orientation Euler angles (pitch, yaw, roll) from hand direction and palm normal.
  - Derive thumb opposition and overall hand openness metrics.
  - Expose structured, zero-allocation spatial metrics per frame on `hands.left.metrics`, `hands.right.metrics`, and `state.metrics`.
- **Deliverables:**
  - `src/utils/MathUtils.js` (`vectorAngle`, `computePalmNormal`, `computePalmOrientation`, `createHandMetrics`, `copyMetrics`, zero-allocation `screenToWorld`)
  - Updated `src/config/AppConfig.js` (Added `biomechanics` configuration block)
  - Updated `src/tracking/LandmarkProcessor.js` (Integrated `_computeBiomechanicalMetrics`, `metrics` structures for left & right)
  - Updated `src/core/StateManager.js` (`state.tracking.metrics`, `hands.left.metrics`, `hands.right.metrics`, `copyMetrics` synchronization)
- **Verification Criteria:**
  - Joint angles, flexion, curl, extension, palm normal, and orientation calculated deterministically at 60 FPS with zero heap allocations; primary hand aliases fully preserved; manual verification pending user check.

---

## Phase 3: Gesture Recognition Engine

### Step 3.1: Open Palm & Fist Recognition Engine
- **Status:** **[COMPLETED]**
- **Objectives:**
  - Implement reliable, modular Open Palm and Fist recognition using MediaPipe 3D landmarks and Phase 2 biomechanical metrics.
  - Implement independent dual-hand gesture tracking (`state.gestures.hands.left` and `state.gestures.hands.right`).
  - Implement temporal stability filtering, frame hysteresis, hold duration validation, and neutral IDLE handling for transitional poses.
  - Preserve backward compatibility with Pinch, Spread, mouse fallback, Three.js shaders, particles, and HUD telemetry.
- **Deliverables:**
  - `src/gestures/GestureRecognizer.js` (Modular recognition engine & temporal stability filter)
  - `src/config/AppConfig.js` (`gestures.openPalm`, `gestures.fist`, `gestures.transition` thresholds)
  - `src/core/StateManager.js` (`setHandGesture`, `state.gestures.hands`, dual-hand telemetry synchronization)
  - `index.html` (Integrated with 60 FPS animation loop, zero heap allocations)
- **Verification Criteria:**
  - Open Palm accurately recognized via finger extension, curl, and hand openness.
  - Fist accurately recognized via finger curl, flexion angles, and thumb opposition.
  - Left and right hand gestures remain completely independent without mutual clobbering.
  - Disappearing hand safely resets only its own state after grace period without resetting the remaining hand.

### Step 3.2: Pinch, Swipe & Individual Finger Detection Engine
- **Status:** **[IMPLEMENTED]** *(Manual verification pending by user)*
- **Objectives:**
  - Implement independent Pinch detection with normalized hand-scale distance tracking, hysteresis, and lifecycle events (`PINCH_START`, `PINCH_END`).
  - Implement independent Directional Swipe detection (`LEFT`, `RIGHT`, `UP`, `DOWN`) with timestamp velocity, dominant axis filtering, cooldown, and discrete event emission (`SWIPE`).
  - Implement independent Individual Finger classification (`EXTENDED`, `CURLED`, `NEUTRAL`) for all 5 digits across both hands with dedicated thumb biomechanics and discrete event emission (`FINGER_CHANGE`).
  - Maintain zero heap allocations in the 60 FPS animation loop and 100% backward compatibility with Open Palm, Fist, shaders, particles, and HUD telemetry.
- **Deliverables:**
  - `src/gestures/PinchDetector.js` (Pinch lifecycle and hysteresis detector)
  - `src/gestures/SwipeDetector.js` (Directional velocity and dominant axis swipe detector)
  - `src/gestures/FingerDetector.js` (5-digit anatomical state classifier)
  - `src/gestures/GestureRecognizer.js` (Coordinated multi-detector integration)
  - `src/config/AppConfig.js` (Centralized thresholds for pinch, swipe, and fingers)
  - `src/core/StateManager.js` (`state.gestures.hands[side].pinch`, `swipe`, `fingers`, update methods)
  - `src/core/EventBus.js` (`PINCH_START`, `PINCH_END`, `SWIPE`, `FINGER_CHANGE`)
- **Verification Criteria:**
  - Independent dual-hand pinch start and end detection with no edge flickering.
  - Discrete directional swipes matching mirrored screen space with cooldown preventing duplicate events.
  - Accurate 5-digit extension/curl classification with neutral transitional state.
  - Disappearing hand resets only its own state without disrupting the other hand.

### Step 3.3: Advanced Gesture Combinations & Custom Gesture Mapping Engine
- **Status:** **[IMPLEMENTED]** *(Manual verification pending by user)*
- **Objectives:**
  - Build a modular advanced gesture combination engine (`src/gestures/GestureCombinationEngine.js`) recognizing composite, sequential, and dual-hand patterns:
    - Pinch + Hold (continuous pinch held for configurable duration).
    - Double Pinch (two distinct pinch activation cycles within configurable temporal window).
    - Peace Sign + Hold (Index + Middle extended, Ring + Pinky curled, held over time).
    - Pointing (Index extended, remaining digits curled).
    - Three-Finger (Index, Middle, Ring extended, Pinky curled).
    - Two-Hand Pinch (simultaneous dual-hand active pinch engagement).
  - Build a declarative, decoupled gesture mapping engine (`src/gestures/GestureMapper.js`) translating raw gesture events into semantic application actions (`SELECT`, `DOUBLE_SELECT`, `SPECIAL_ACTION`, `POINT`, `MENU_TOGGLE`, `TWO_HAND_CONTROL`).
  - Implement priority-based arbitration, exclusivity suppression, action cooldowns, and dynamic registration/unregistration.
  - Zero heap allocations during the 60 FPS animation loop and full backward compatibility.
- **Deliverables:**
  - `src/gestures/GestureCombinationEngine.js` (Composite, duration, sequential, and dual-hand combination evaluator)
  - `src/gestures/GestureMapper.js` (Declarative gesture-to-action semantic mapping layer)
  - `src/config/AppConfig.js` (`combinations` and `gestureMapping` configuration sections)
  - `src/core/StateManager.js` (`state.gestures.combinations`, `state.gestures.mapping`, helper update methods)
  - `src/core/EventBus.js` (`GESTURE_COMBINATION_START`, `GESTURE_COMBINATION_END`, `PINCH_HOLD_START`, `PINCH_HOLD_END`, `DOUBLE_PINCH`, `PEACE_SIGN_HOLD`, `POINTING`, `THREE_FINGER`, `BOTH_HANDS_PINCH_START`, `BOTH_HANDS_PINCH_END`, `ACTION_TRIGGERED`)
  - `index.html` (Animation loop execution and console observability references)
- **Verification Criteria:**
  - Discrete single-fire trigger for Pinch + Hold, Double Pinch, Peace Sign + Hold, Pointing, Three-Finger, and Two-Hand Pinch.
  - Semantic action events dispatch cleanly through EventBus with priority and cooldown enforcement.
  - Incomplete or interrupted gestures cleanly reset without state leakage or cross-hand interference.

### Step 3.4: Temporal Hysteresis & Gesture Event Manager
- **Status:** **[PENDING]**
- **Objectives:**
  - Implement temporal hysteresis filtering ($N = 3$ consecutive frames) to prevent gesture flickering during transitions.
  - Implement `src/gestures/GestureEventManager.js` dispatching standard lifecycle events:
    `gesturestart`, `gesturechange`, `gestureend`, `gesturetap`.
  - Implement 3D spatial raycasting from fingertips into the scene graph.
- **Deliverables:**
  - `src/gestures/GestureEventManager.js`
- **Verification Criteria:**
  - Rock-solid gesture transitions with clean event streams and accurate 3D object hit-testing.

---

## Phase 4: 3D Holographic Interface

### Step 4.1: 3D Holographic Interface Foundation
- **Status:** **[IMPLEMENTED]** *(Manual verification pending by user)*
- **Objectives:**
  - Establish a modular, extensible 3D holographic interface foundation under `src/hologram/` using the existing Three.js rendering architecture.
  - Implement `HologramObject` base abstraction with hierarchical transforms, lifecycle hooks, and cascading opacity.
  - Implement `HologramMaterials` providing futuristic electric cyan/blue/purple palettes, wireframes, Fresnel rim glow, and spatial grid shaders.
  - Implement `HologramEffects` with reusable procedural oscillation, scanlines, and zero-allocation math helpers.
  - Implement foundational built-in holographic elements:
    - **Holographic Grid:** Subtle spatial reference plane with distance attenuation and radial range circles.
    - **Holographic Rings:** Multi-tier concentric 3D gimbal rings counter-rotating in space with tick indicators.
    - **Holographic Core:** Central layered geometric power core with breathing crystal and outer containment cage.
  - Implement `HologramScene` managing mounting and lifecycle on the main Three.js scene graph.
  - Implement `HologramManager` providing centralized coordination, zero-allocation 60 FPS animation dispatch, StateManager/EventBus synchronization, and debug inspection APIs.
  - Integrate into `index.html` within the single animation loop without duplicate renderers or loops.
- **Deliverables:**
  - `src/hologram/HologramObject.js`
  - `src/hologram/HologramMaterials.js`
  - `src/hologram/HologramEffects.js`
  - `src/hologram/HologramGrid.js`
  - `src/hologram/HologramRings.js`
  - `src/hologram/HologramCore.js`
  - `src/hologram/HologramScene.js`
  - `src/hologram/HologramManager.js`
  - Updated `src/config/AppConfig.js`
  - Updated `src/core/EventBus.js`
  - Updated `src/core/StateManager.js`
  - Updated `index.html`
- **Verification Criteria:**
  - Coexists harmoniously with existing raymarched symbiote and GPU particle systems.
  - Zero heap allocations during continuous 60 FPS animation loop.
  - Safe global debug reference `window.hologramManager` accessible from browser console.
  - Seamless visibility and opacity controls synced with StateManager and EventBus.

### Step 4.2: Dual-Hand 3D Interaction Engine
- **Status:** **[IMPLEMENTED]** *(Manual verification pending by user)*
- **Objectives:**
  - Implement independent left-hand and right-hand 3D interaction capabilities using existing MediaPipe tracking and Three.js architecture.
  - Implement `HandController` encapsulating independent 3D positions, EMA smoothing, velocity, and handedness for left and right hands.
  - Implement `HologramCursor` providing visual 3D reticles with hand-specific colors (Cyan for Right, Violet for Left) and gestural feedback (pinch contract, open expand, fist compact).
  - Implement `TwoHandMetrics` calculating distance, midpoint, horizontal/vertical/depth deltas, and normalized span ratio with zero GC allocations.
  - Implement `InteractionEngine` coordinating dual controllers, EventBus lifecycle events (`INTERACTION_HAND_TRACKED`, `INTERACTION_HAND_LOST`, `INTERACTION_TWO_HAND_START/UPDATE/END`), and StateManager synchronization.
  - Integrate into `index.html` main animation loop and expose `window.interactionEngine` for runtime debugging.
- **Deliverables:**
  - `src/hologram/HologramCursor.js`
  - `src/interaction/HandController.js`
  - `src/interaction/TwoHandMetrics.js`
  - `src/interaction/InteractionEngine.js`
  - Updated `src/config/AppConfig.js`
  - Updated `src/core/EventBus.js`
  - Updated `src/core/StateManager.js`
  - Updated `index.html`
- **Verification Criteria:**
  - Independent left and right 3D tracking without cross-hand state overwriting.
  - Smooth cursor rendering with immediate reacquisition snapping and graceful loss fading.
  - Continuous zero-allocation execution during 60 FPS animation loop.
  - Robust two-hand metric computation without producing NaN or invalid coordinates.

### Step 4.3: Gesture-Controlled Holographic Objects
- **Status:** **[IMPLEMENTED]** *(Manual verification pending by user)*
- **Objectives:**
  - Implement an extensible, modular interactable 3D holographic entity base (`src/hologram/InteractableHologram.js`) supporting discrete interaction states (`IDLE`, `HOVERED`, `SELECTED`, `ACTIVATED`), analytical bounding spheres, dynamic scale lerping ($1.0\times \to 1.10\times \to 1.18\times \to 1.35\times$), animated 4-corner sci-fi targeting reticles, and hand-specific color illumination.
  - Implement a central holographic object coordinator (`src/interaction/HolographicObjectManager.js`) maintaining object registry, proximity hit-testing with targeting hysteresis buffer ($0.08$ units), deterministic dual-hand conflict arbitration (first-hand ownership), pinch-and-drag 3D spatial translation, and gestural action activation.
  - Spawn and mount 3 distinct, spaced holographic demo artifacts (`obj_prism` Data Prism on left, `obj_cube` Hyper Cube on right, `obj_orb` Power Orb at top-center) without interfering with the central symbiote core, gimbal rings, or grid.
  - Seamlessly synchronize hover, selection, and drag states with `StateManager` (`state.interaction.hologramObjects`) and emit typed events through `EventBus` (`HOLOGRAM_OBJECT_HOVER`, `HOLOGRAM_OBJECT_UNHOVER`, `HOLOGRAM_OBJECT_SELECTED`, `HOLOGRAM_OBJECT_RELEASED`, `HOLOGRAM_OBJECT_ACTIVATED`).
  - Guarantee zero heap allocations during continuous 60 FPS animation loop.
- **Deliverables:**
  - `src/hologram/InteractableHologram.js` (Extensible interactable holographic entity class with multi-layer geometry, reticle brackets, and scale/color morphing)
  - `src/interaction/HolographicObjectManager.js` (Central spatial hit-testing coordinator, dual-hand arbitration, and pinch-drag engine)
  - Updated `src/config/AppConfig.js` (`objects` configuration section with tolerances, lerp rates, and state colors)
  - Updated `src/core/EventBus.js` (Holographic object lifecycle event constants)
  - Updated `src/core/StateManager.js` (`hologramObjects` state tree, aliases, and helper update methods)
  - Updated `src/interaction/HandController.js` (Bi-directional gesture resolution synchronization)
  - Updated `index.html` (Module instantiation, lifecycle mounting, 60 FPS update integration, and global debug exposure)
- **Verification Criteria:**
  - Dual-hand independent pointing, proximity detection, and hover highlighting (Cyan for right hand, Violet for left hand).
  - Tactile pinch-selection locks object to hand controller with luminous sky blue illumination and firm bracket alignment.
  - Smooth pinch-and-drag 3D translation following hand movement with exponential damping.
  - Natural release on pinch open or tracking loss without orphaned selections.
  - Kinetic action activation on supported gestures (e.g. Fist / Spread) triggering scale burst, emerald pulse, and notification dispatch.
  - 60 FPS performance maintained with zero garbage collection allocations.

### Step 4.4: Spatial Interaction & Object Manipulation (Two-Hand RST Manipulation)
- **Status:** **[IN PROGRESS]** *(Stage 1, Stage 2, Stage 3, and Stage 4 Implemented — Manual verification pending by user)*
- **Objectives:**
  - Implement full dual-hand Rotate-Scale-Translate (RST) spatial manipulation for interactable 3D holographic objects.
  - **Stage 1 (Foundation & Persistent Transforms):** Persistent `userScale` and `userRotation` channels decoupled from discrete state-machine scale, zero-allocation transform setters (`setUserScale`, `setUserRotation`, `resetUserTransforms`), and root reorientation preserving inner mesh ambient counter-rotations. *(Implemented)*
  - **Stage 2 (Two-Hand Distance Zoom Engine):** Dual-hand active pinch session engagement, baseline distance latching ($d_0, s_0$), relative distance deadband ($3.5\%$) filtering hand tremor, continuous smooth scaling within $[0.40, 2.80]$, tracking-loss suspension and seamless reacquisition re-anchoring, with single-hand drag gating. *(Implemented)*
  - **Stage 3 (Two-Hand Rotation Engine):** Coronal planar steering-wheel rotation from dual-hand angle $\Delta \theta = \text{atan2}(\Delta Y, \Delta X)$, branch-cut wrap normalization across $[-\pi, +\pi]$ boundary, $3.0^\circ$ deadband filtering, sensitivity scaling ($1.10\times$), concurrent zoom/rotation execution, tracking-loss pause, and seamless baseline re-anchoring without snap-backs. *(Implemented)*
  - **Stage 4 (Coordinated Two-Hand Translation Engine & Stalling Surgical Fix):** Bilateral 3D midpoint translation ($\mathbf{P}_{\text{mid}} = (\mathbf{P}_{\text{left}} + \mathbf{P}_{\text{right}}) / 2$), displacement tracking relative to engagement baseline ($\mathbf{P}_{\text{obj0}} + (\mathbf{P}_{\text{mid}} - \mathbf{P}_{\text{mid0}})$), full $X, Y, Z$ depth motion, `twoHandDragSmoothing` (24.0) exponential decay, continuous drag offset synchronization preventing single-hand handoff snaps, decoupled exclusive session ownership (`_isTwoHandManipulatingObject`), 150ms tracking-loss grace window, safe exactly-once reacquisition baseline re-anchoring, and 2-frame pinch release debouncing with clean single-hand handoff. *(Implemented — Manual verification pending)*
  - **Stage 5 (Telemetry & Spatial Refinement):** Live manipulation telemetry in HUD and debug consoles. *(Pending)*
- **Deliverables:**
  - `src/interaction/HolographicObjectManager.js` (Two-hand manipulation session manager, distance zoom, planar rotation, and coordinated midpoint translation engines)
  - `src/hologram/InteractableHologram.js` (Persistent transform channels and multi-rate interpolation)
  - `src/config/AppConfig.js` (`interaction.manipulation.twoHand` configuration block)
- **Verification Criteria:**
  - Full simultaneous Rotate-Scale-Translate (RST) interaction on selected holographic objects with zero cross-axis interference.
  - Midpoint displacement smoothly carries the object in 3D ($X, Y, Z$) with natural depth responsiveness.
  - Releasing one hand seamlessly hands off translation to single-hand drag without position jumping.
  - Releasing both pinches cleanly preserves final 3D position, user scale, and orientation.
  - Momentary tracking loss pauses all manipulation; reacquisition resumes smoothly with zero jerking.

---

## Phase 5: Particle Physics & Interaction

### Step 5.1: GPU Buffer-Geometry Particle Engine Architecture
- **Status:** **[IMPLEMENTED]** *(Manual verification pending by user)*
- **Objectives:**
  - Establish a high-performance GPU buffer-geometry particle engine (`src/particles/ParticleEngine.js`) scaling up to 15,000 particles.
  - Utilize `THREE.BufferGeometry` with custom typed planar attributes: `position`, `aVelocity`, `aPhase`, `aSize`, `aColor`, and `aLifetime` (reserved for future lifecycle/fading features).
  - Implement custom GLSL vertex shader (`src/shaders/vfx/particle.vert`) supporting perspective point size attenuation, depth clamping ($1.0$ to $128.0$ px), and autonomous GPU procedural harmonic orbital displacement (`uGpuMotion`).
  - Implement custom GLSL fragment shader (`src/shaders/vfx/particle.frag`) computing liquid spherical droplet surface normals ($\sqrt{1 - r^2}$), specular glints (power 32.0), Fresnel rim glow (power 3.2), and mathematically valid edge anti-aliasing (`1.0 - smoothstep(0.80, 1.0, r2)`).
  - Implement `src/particles/ParticleShaders.js` encapsulating custom `THREE.ShaderMaterial` with `THREE.AdditiveBlending` and uniform bindings (`uTime`, `uBaseSize`, `uDpr`, `uSpeed`, `uGpuMotion`, `uOpacity`, `uLightDir`, `uBaseColor`, `uSpecularColor`, `uRimColor`).
  - Provide dynamic particle count scaling via `geometry.setDrawRange(0, count)` with zero garbage collection allocations.
  - Explicitly bypass CPU frustum culling (`points.frustumCulled = false`) to account for procedural GPU vertex displacement and point-sprite attenuation where static CPU geometry bounds are unsuitable.
  - Support configurable quality presets (`low`: 1,500, `medium`: 3,000, `high`: 8,000, `ultra`: 15,000) synced with `AppConfig`, `StateManager`, and bidirectional `EventBus` command listeners.
  - Maintain strict separation of concerns: hand attractors and gesture dynamics are decoupled and deferred to Steps 5.3 and 5.4.
- **Deliverables:**
  - `src/particles/ParticleEngine.js` (Singleton GPU particle engine controller)
  - `src/particles/ParticleShaders.js` (ShaderMaterial factory, additive blending, and uniform definitions)
  - `src/shaders/vfx/particle.vert` (GLSL vertex shader with perspective attenuation and orbital displacement)
  - `src/shaders/vfx/particle.frag` (GLSL fragment shader with liquid droplet normal, specular glint, and Fresnel rim)
  - Updated `src/config/AppConfig.js` (`particles` configuration block)
  - Updated `src/core/EventBus.js` (`PARTICLE_VISIBILITY`, `PARTICLE_COUNT`, `PARTICLE_QUALITY`)
  - Updated `src/core/StateManager.js` (`rendering.particles` state and helper methods)
  - Updated `index.html` (Replaced inline CPU loop with `ParticleEngine` lifecycle while preserving backward-compatible aliases)
- **Verification Criteria:**
  - 15,000 capacity allocated upfront with smooth 60 FPS procedural GPU rendering.
  - Custom GLSL point shader correctly attenuates point sizes with perspective and renders spherical liquid droplets with specular highlights, rim glow, and additive blending.
  - Dynamic count adjustment modifies draw range in $O(1)$ without re-allocating GPU buffers.
  - StateManager and EventBus bidirectionally control visibility, density, and quality presets without event recursion.
  - Global debug reference `window.particleEngine` accessible from browser console.

### Step 5.2: Particle Attraction and Repulsion
- **Status:** **[IMPLEMENTED]** *(Manual verification pending by user)*
- **Objectives:**
  - Implement configurable GPU-side attraction and repulsion force fields in the vertex shader (`src/shaders/vfx/particle.vert` and `src/particles/ParticleShaders.js`).
  - Support continuous distance falloff ($f = (1 - d/R)^{\text{falloff}}$), soft core center stability, and maximum displacement caps.
  - Implement smooth temporal transitions ($\alpha = 1 - e^{-\lambda dt}$) on activation, deactivation, and parameter updates to prevent abrupt particle snaps.
  - Expose clean control and inspection APIs on `ParticleEngine` (`setAttractor`, `setRepulsor`, `setForceField`, `updateForceField`, `clearForceField`, `getForceFieldState`).
  - Integrate with `AppConfig.particles.forceField`, `StateManager.state.rendering.particles.forceField`, and `EventBus` (`PARTICLE_FORCE_FIELD`).
- **Deliverables:**
  - Updated `src/particles/ParticleEngine.js` (Force field API, zero-allocation temporal lerp, StateManager & EventBus integration)
  - Updated `src/particles/ParticleShaders.js` (Force field uniforms and GLSL integration)
  - Updated `src/shaders/vfx/particle.vert` (GLSL force-field displacement function)
  - Updated `src/config/AppConfig.js` (`particles.forceField` configuration block)
  - Updated `src/core/EventBus.js` (`PARTICLE_FORCE_FIELD` event)
  - Updated `src/core/StateManager.js` (`rendering.particles.forceField` state)
- **Verification Criteria:**
  - Attraction pulls particles toward the interaction point within configured radius with smooth falloff.
  - Repulsion pushes particles away from the interaction point without center instability or division-by-zero.
  - Particles outside the influence radius remain 100% unaffected.
  - Autonomous orbital motion resumes smoothly when force field is cleared.
  - Transitions activate and disengage without abrupt particle snapping.

### Step 5.3: Hand-Controlled Particle Movement (Attractors & Repulsors)
- **Status:** **[IMPLEMENTED]** *(Manual verification pending by user)*
- **Objectives:**
  - Connect processed 3D hand coordinates (from `LandmarkProcessor` and `InteractionEngine` controllers) directly to the GPU particle force-field engine (`ParticleEngine`).
  - Implement Single-Hand Interaction: Drive particle force-field center from the active hand with configurable attraction/repulsion modes, anchor point selection (`position`, `palm`, `indexTip`), and exponential smoothing ($\alpha = 1 - e^{-\lambda dt}$).
  - Implement Two-Hand Interaction: Support independent left and right hand influence fields simultaneously in the custom GLSL vertex shader (`particle.vert` and `ParticleShaders.js`) without silent overwriting or thread collisions (`uForce*` and `uForce2*`), vectorially combining displacements and capping net displacement safely.
  - Implement Tracking Loss Grace & Reacquisition: 150ms grace window holding field state through momentary tracking jitter; exponential fade-out to zero on persistent loss ($\lambda = 10.0$); immediate positional snapping upon reacquisition if faded, completely eliminating across-screen sweeps.
  - Configure dedicated parameters in `AppConfig.particles.handInteraction` (`leftMode: 'repel'`, `rightMode: 'attract'`, `singleHandMode`, `radius: 2.20`, `attractStrength: 1.20`, `repelStrength: 1.50`, `trackingLossGraceMs: 150`, `fadeSpeed: 10.0`, `smoothing: 18.0`).
  - Expose clean runtime control and inspection APIs on `ParticleEngine` (`updateHandInteraction`, `setHandMode`, `setHandForceField`, `setHandInteractionEnabled`, `isHandInteractionEnabled`, `getHandForceState`).
  - Integrate bidirectional state synchronization with `StateManager.state.rendering.particles.handInteraction` and `EventBus` (`PARTICLE_HAND_INTERACTION`) preventing event feedback recursion.
  - Wire per-frame updates directly into `index.html` main 60 FPS animation loop with zero heap allocations.
- **Deliverables:**
  - Updated `src/particles/ParticleEngine.js` (Hand tracking coordinator, grace window, reacquisition snapping, dual-hand shader uniform updates, and clean inspection APIs)
  - Updated `src/shaders/vfx/particle.vert` & `src/particles/ParticleShaders.js` (Dual-hand force field GLSL programs with bounded vector accumulation)
  - Updated `src/config/AppConfig.js` (`particles.handInteraction` configuration block)
  - Updated `src/core/StateManager.js` (`rendering.particles.handInteraction` state and `updateParticleHand` helper)
  - Updated `src/core/EventBus.js` (`PARTICLE_HAND_INTERACTION` event constant)
  - Updated `index.html` (Integrated `updateHandInteraction` into main 60 FPS loop)
- **Verification Criteria:**
  - Right hand attracts particles dynamically in 3D world space while left hand repels particles simultaneously with zero interference or uniform overwriting.
  - Displacements fall off quadratically with distance and preserve autonomous GPU orbital flow for particles outside the influence radius.
  - Momentary hand occlusion (<150ms) retains continuous particle attraction without flickering; prolonged loss smoothly fades influence to zero.
  - Re-entering the camera frame smoothly re-anchors to current hand position without dragging particles across the screen.
  - 60 FPS rendering maintained with zero garbage collection allocations in the primary animation loop.

### Step 5.4: Gesture-Driven Particle Dynamics & Velocity Stretch
- **Status:** **[PENDING]**
- **Objectives:**
  - Connect gesture states directly to particle physics modes:
    - **Open Palm:** Swirling galaxy vortex orbiting the palm center.
    - **Fist:** Rapid collapse into a tight, dense, pulsating gravitational singularity.
    - **Pinch:** Filament stream stretching between thumb and index fingertips.
    - **Spread / Wave:** High-velocity radial explosion with motion-stretched trails.
- **Deliverables:**
  - Dynamics update loop in `src/particles/ParticleEngine.js`
- **Verification Criteria:**
  - Dramatic, fluid visual shifts in particle behavior matching user gesture intents instantly.

---

## Phase 6: Superpower & Visual Effects Engine

### Step 6.1: Visual Effects System Architecture & Mode Dispatcher
- **Status:** **[PENDING]**
- **Objectives:**
  - Implement `src/vfx/ShaderVFXEngine.js` managing active elemental superpower modes.
  - Provide smooth cross-fading and uniform transitions between effect states:
    `HOLOGRAPHIC`, `LIGHTNING`, `FIRE`, `CRYO`, `FORCEFIELD`.
  - Connect effect mode switching to Gesture Event Manager, Voice Commands, and UI Selector.
- **Deliverables:**
  - `src/vfx/ShaderVFXEngine.js`
- **Verification Criteria:**
  - Seamless, glitch-free transitions between distinct visual effect modes.

### Step 6.2: Procedural Lightning & Electric Arc Shaders
- **Status:** **[PENDING]**
- **Objectives:**
  - Implement `src/vfx/LightningEffect.js` generating procedural branching electric arcs between fingertips or from hands into space.
  - Compute jagged multi-octave noise spines with high-frequency temporal flicker.
  - Implement intense cyan-white plasma core blooming with blue-violet outer glow.
- **Deliverables:**
  - `src/vfx/LightningEffect.js`
  - `src/shaders/vfx/lightning.vert`
  - `src/shaders/vfx/lightning.frag`
- **Verification Criteria:**
  - Realistic, crackling electric arcs emitting continuously from user fingertips.

### Step 6.3: Fire, Plasma & Volumetric Energy Shaders
- **Status:** **[PENDING]**
- **Objectives:**
  - Implement `src/vfx/FirePlasmaEffect.js` generating fiery plasma flames engulfing the hands.
  - Implement turbulent upward convection vectors with animated noise displacement.
  - Gradient mapping from deep crimson through intense orange, bright gold, and white-hot cores.
- **Deliverables:**
  - `src/vfx/FirePlasmaEffect.js`
  - `src/shaders/vfx/fire.frag`
- **Verification Criteria:**
  - Mesmerizing, organic living fire that clings to hand contours and trails hand motion.

### Step 6.4: Cryo Ice Crystals & Hexagonal Energy Shield Shaders
- **Status:** **[PENDING]**
- **Objectives:**
  - Implement `src/vfx/CryoIceEffect.js` rendering faceted, frosted crystalline ice shards emanating from fingers.
  - Implement `src/vfx/ForcefieldEffect.js` generating an interactive hexagonal energy barrier in front of an open palm.
  - Create ripple shockwave distortions across the forcefield grid upon interaction.
- **Deliverables:**
  - `src/vfx/CryoIceEffect.js`
  - `src/vfx/ForcefieldEffect.js`
  - `src/shaders/vfx/shield.frag`
- **Verification Criteria:**
  - Sharp crystalline frost effects and futuristic sci-fi hexagonal forcefield barriers reacting to spatial input.

---

## Phase 7: Advanced JARVIS Features & Experience

### Step 7.1: Procedural Sci-Fi Audio Synthesizer (Web Audio API)
- **Status:** **[PENDING]**
- **Objectives:**
  - Implement `src/audio/AudioSystem.js` using the Web Audio API for 100% procedural sound synthesis.
  - Synthesize custom acoustic cues:
    - Holographic activation chime
    - Dial rotary click
    - Electric crackle & arc hum
    - Flame combust rumble
    - Ice crystallize snap
    - Forcefield impact pulse
  - Provide master volume control, spatial stereo panning, and mute toggle.
- **Deliverables:**
  - `src/audio/AudioSystem.js`
- **Verification Criteria:**
  - Zero external MP3/WAV download requirements; instant, zero-latency acoustic feedback.

### Step 7.2: Voice Command Recognition Engine (Web Speech API)
- **Status:** **[PENDING]**
- **Objectives:**
  - Implement `src/audio/VoiceRecognizer.js` wrapping `SpeechRecognition` / `webkitSpeechRecognition`.
  - Define speech grammar:
    - *"Jarvis"* (wake trigger)
    - *"Activate shield"* / *"Shield"* (toggles forcefield)
    - *"Mode fire"* / *"Mode lightning"* / *"Mode cryo"* (switches superpower)
    - *"Reset interface"* / *"Diagnostic"* (controls HUD)
  - Connect speech recognition triggers to the central `EventBus`.
- **Deliverables:**
  - `src/audio/VoiceRecognizer.js`
- **Verification Criteria:**
  - Robust voice command handling with on-screen transcription and confirmation feedback.

### Step 7.3: Interactive Multi-Mode Experience Switcher
- **Status:** **[PENDING]**
- **Objectives:**
  - Implement cohesive experience modes combining UI, VFX, audio, and gesture presets:
    1. **JARVIS Console Mode:** High-tech data visualization, rotating HUD widgets, spatial telemetry.
    2. **Elemental Combat Mode:** Lightning, fire, ice, and energy shields triggered by combat gestures.
    3. **Particle Sandbox Mode:** Freeform particle sculpting and gravitational play.
  - Enable smooth switching via Voice, Gesture (Two-Hand Swipe), or 3D Holographic Dial.
- **Deliverables:**
  - Orchestration in `src/core/App.js` and `src/ui/ModeSelector.js`
- **Verification Criteria:**
  - Effortless switching between distinct experiences with integrated visual and audio themes.

### Step 7.4: 3D Object Manipulation Sandbox (Inspect, Rotate, Explode)
- **Status:** **[PENDING]**
- **Objectives:**
  - Mount an interactive 3D holographic object (e.g., Arc Reactor core or sci-fi drone wireframe) in the scene.
  - Implement natural two-hand manipulation:
    - Pinch & Drag $\to$ Translate in 3D space.
    - Two-Hand Pinch $\to$ Scale and inspect.
    - Two-Hand Twist $\to$ Rotate around arbitrary axes.
    - Fist Clench $\to$ Disassemble / Exploded-view animation.
- **Deliverables:**
  - `src/scene/InteractiveObject.js`
- **Verification Criteria:**
  - Fluid, intuitive spatial computing object manipulation matching sci-fi movie expectations.

---

## Phase 8: Optimization, Quality & Release

### Step 8.1: GPU Profiling & Adaptive Resolution Tuning
- **Status:** **[PENDING]**
- **Objectives:**
  - Profile WebGL draw calls, shader instruction counts, and fill rate bottlenecks across various hardware tiers.
  - Calibrate dynamic adaptive resolution scaling ($0.5\times$ to $1.0\times$) based on rolling frame times.
  - Optimize shader branch prediction and eliminate redundant texture samples.
- **Deliverables:**
  - Performance profiling report and tuning in `src/core/Engine.js` and `src/scene/PostProcessor.js`.
- **Verification Criteria:**
  - Uncompromised 60 FPS performance maintained across laptops with integrated GPUs.

### Step 8.2: Memory Leak Auditing & Garbage Collection Elimination
- **Status:** **[PENDING]**
- **Objectives:**
  - Audit Chrome DevTools heap snapshots during continuous 30-minute runtime sessions.
  - Verify zero object allocations per frame in tracking, physics, and rendering loops.
  - Ensure proper disposal of geometries, materials, render targets, and event listeners on teardown.
- **Deliverables:**
  - Memory audit documentation and memory leak fixes.
- **Verification Criteria:**
  - Completely flat heap allocation graph over extended interaction sessions.

### Step 8.3: Cross-Browser & Device Compatibility Hardening
- **Status:** **[PENDING]**
- **Objectives:**
  - Test across Google Chrome, Microsoft Edge, Mozilla Firefox, and Apple Safari (macOS/iOS).
  - Validate WebGL 2 feature detection and fallbacks for Safari WebKit differences.
  - Support touch and hybrid mouse inputs seamlessly.
- **Deliverables:**
  - Cross-browser compatibility adjustments in `src/camera/CameraManager.js` and `src/scene/SceneManager.js`.
- **Verification Criteria:**
  - Identical visual fidelity and rock-solid stability across all major browsers.

### Step 8.4: Documentation Finalization & Production Release Build
- **Status:** **[PENDING]**
- **Objectives:**
  - Finalize all project documentation, API references, user interaction guides, and architecture diagrams.
  - Ensure repository is structured, tagged, and ready for deployment or hosting.
- **Deliverables:**
  - Updated `README.md`
  - Release notes and deployment verification.
- **Verification Criteria:**
  - Professional, clean, fully documented production-ready release.
