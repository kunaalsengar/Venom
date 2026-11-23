# PROJECT NEXUS — SYSTEM ARCHITECTURE BLUEPRINT
**Document Version:** 1.11.0  
**Phase & Step:** Phase 5, Step 5.2 (Particle Attraction and Repulsion — Implemented, Manual Verification Pending)  
**Classification:** Technical Architecture Specification  
**Target Platform:** Modern Web Browsers (Chrome, Edge, Safari, Firefox) via WebGL 2, Three.js, MediaPipe Tasks Vision

---

## 1. Executive Summary & Vision

**PROJECT NEXUS** is a next-generation, browser-based, spatial computing experience inspired by the futuristic JARVIS holographic interactive console. It delivers low-latency, real-time two-hand tracking, biomechanical gesture recognition, interactive 3D holographic interfaces, GPU-driven particle simulations, and cinematic GLSL visual effects (lightning, fire, cryo, energy shields) directly inside standard web browsers without requiring browser extensions, native plugins, or client-side installations.

### Core Architectural Tenets
1. **Browser-First & Zero-Install:** 100% client-side execution leveraging standard Web APIs (WebGL 2, Web Audio API, Web Speech API, MediaDevices).
2. **Deterministic 60 FPS Performance:** Zero garbage-collection allocations in the main rendering and tracking loop; pre-allocated scratch linear algebra vectors; bounded iteration limits.
3. **Decoupled Modular Architecture:** Clear separation of concerns across 12 distinct subsystems communicating through an optimized hybrid model (direct frame telemetry for high-frequency coordinate streaming + typed event bus for discrete gesture/voice signals).
4. **Preservation of Existing Assets:** Safe architectural evolution that isolates and modularizes validated math, shaders, and tracking logic from existing prototypes without destructive rewrites.

---

## 2. Technology Stack & Dependency Configuration

### 2.1 Confirmed Technology Stack & Pinned Dependency Versions

| Layer | Technology | Pinned Version / Standard | CDN Source / Endpoint | Architectural Role |
| :--- | :--- | :--- | :--- | :--- |
| **Language** | Vanilla JavaScript | ECMAScript 2022+ (Native ES Modules) | Browser Native | Clean, modular client-side logic without mandatory transpilations. |
| **Markup & Layout** | HTML5 / CSS3 | Modern Semantic Standards | Browser Native | High-DPI canvas overlay, typography, and responsive viewport sizing. |
| **3D Rendering** | Three.js Core | `0.160.0` (Pinned ESM) | `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js` | Scene graph, camera frustum projection, material management. |
| **Post-Processing** | Three.js Addons | `0.160.0` (Pinned ESM) | `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/` | `EffectComposer`, `RenderPass`, `ShaderPass`, `UnrealBloomPass`. |
| **Vision Framework** | MediaPipe Tasks Vision | `0.10.14` (Pinned ESM) | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs` | Multi-hand 21-landmark tracking with WebGL GPU & CPU delegates. |
| **Vision WASM** | MediaPipe WASM Runtime | `0.10.14` (Pinned WASM) | `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm` | High-performance WebAssembly computer vision execution engine. |
| **Vision Model** | Hand Landmarker Task | `float16/1` (Pinned Task Model) | `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` | Pretrained quantized deep neural network model binary (~8.4 MB). |
| **Shader Language** | GLSL ES | 3.00 (WebGL 2) / 1.00 (WebGL 1) | Embedded in JS Modules | Raymarching, particle physics, procedural noise, and screen filters. |
| **Audio Synthesis** | Web Audio API | W3C Standard Specification | Browser Native | Zero-asset, low-latency procedural sci-fi audio sound generation. |
| **Voice Processing** | Web Speech API | `SpeechRecognition` / `webkitSpeechRecognition` | Browser Native | Native browser speech-to-text voice command parser. |
| **Backend / ML** | Python / NumPy | *Optional Future Extension Only* | None (Client-Only) | Strictly isolated; zero client-runtime dependency in Phase 1–8. |

### 2.2 Pinned ESM / CDN Dependency Strategy

PROJECT NEXUS strictly maintains a **browser-first, zero-install architecture**:
1. **Browser-Native Import Map:** All external modules are declared in a standardized `<script type="importmap">` tag inside the HTML entry point.
2. **Three.js Core & Addons Coherence:**
   - Three.js core is imported via the bare specifier `'three'`.
   - Addons are imported via the namespaced specifier `'three/addons/'`.
   - Because `examples/jsm/` modules internally invoke `import { ... } from 'three'`, the import map guarantees that both core and addons bind to the exact same Three.js instance at version `0.160.0`. This completely prevents duplicate Three.js instances, conflicting prototype registries, and WebGL context mismatches.
3. **No Unpinned or Floating Versions:**
   - Unpinned CDNs (e.g., `@latest` or unversioned unpkg/jsdelivr URLs) are strictly prohibited. Every URL pins the exact patch version (`0.160.0`, `0.10.14`).
4. **No Build Step Required (Zero npm/Vite Requirement):**
   - No `node_modules`, bundlers, transpilers, or build steps are required for development or runtime execution.
   - Any developer or user can simply clone the repository, serve the folder over HTTP, and immediately run the complete spatial experience.

### 2.3 MediaPipe WASM & Model Resource Strategy

- **WASM Distribution:** The WASM binary files (`vision_wasm_internal.wasm`, `vision_wasm_internal.js`) are dynamically requested by `FilesetResolver.forVisionTasks()` from the pinned jsDelivr version directory (`@mediapipe/tasks-vision@0.10.14/wasm`).
- **Model Distribution:** The quantized `float16` hand landmark neural network binary is loaded directly from Google's official Cloud Storage model repository via HTTPS with HTTP Range requests.
- **Caching & Offline Behavior:**
  - Modern browsers cache these immutable assets after first download.
  - If network access is interrupted or camera permission is withheld, the system automatically activates the **Synthetic Mouse Fallback Controller**, ensuring zero white screens or unhandled exceptions.

### 2.4 Shader Loading Approach

- **Template Literal Shader Architecture:** All GLSL vertex and fragment shaders are defined as multiline ES template strings directly within their respective JavaScript materials.
- **Architectural Advantages:**
  - Eliminates asynchronous `fetch()` requests and race conditions during WebGL shader initialization.
  - Removes the need for custom webpack/vite glsl-loader plugins or complex build pipelines.
  - Ensures atomic, zero-latency instantiation of materials and passes during startup.

### 2.5 Browser & Web API Requirements

| Capability | Browser API | Minimum Supported Browser | Fallback Strategy |
| :--- | :--- | :--- | :--- |
| **Webcam Feed** | `navigator.mediaDevices.getUserMedia` | Chrome 53+, Edge 79+, Safari 11+, Firefox 36+ | Switches automatically to Synthetic Mouse Fallback Mode with user alert. |
| **3D Rendering** | WebGL 2 (`WebGLRenderingContext`) | Chrome 56+, Edge 79+, Safari 15+, Firefox 51+ | Falls back to WebGL 1 context with standard precision definitions. |
| **GPU Vision** | WebGL GPU Delegate (MediaPipe) | Modern Desktop / Mobile GPUs | Transparent fallback to multi-threaded CPU delegate. |
| **Module Loading** | `<script type="importmap">` | Chrome 89+, Edge 89+, Safari 16.4+, Firefox 108+ | Native browser standard supported on all modern browsers since 2023. |
| **Audio Engine** | `window.AudioContext` | Chrome 35+, Edge 79+, Safari 14.1+, Firefox 25+ | Graceful audio silence; all visual and spatial features continue normally. |
| **Voice Control** | `webkitSpeechRecognition` / `SpeechRecognition` | Chrome 33+, Edge 79+, Safari 14.1+ (iOS) | UI & gesture mode selectors provide 100% equivalent control coverage. |

### 2.6 Development Environment & Local Server Configuration

Modern web browsers enforce strict security boundaries on cutting-edge Web APIs:
1. **Secure Origin Enforcement:**
   - Web camera access via `getUserMedia` and WebAssembly multi-threading require a **Secure Origin** (`https://` or `http://localhost` / `http://127.0.0.1`).
   - Loading `index.html` via the `file://` protocol is blocked by browser CORS and security policies.
2. **Local Development Server Instructions:**
   - Serve the project directory from your terminal using Python's built-in HTTP server:
     ```bash
     python3 -m http.server 8000
     ```
   - Alternatively, any standard static HTTP server may be utilized:
     ```bash
     # Node.js npx serve
     npx serve -p 8000 .
     # PHP built-in server
     php -S localhost:8000
     ```
3. **Execution Instructions:**
   - Open your browser and navigate to: `http://localhost:8000`
   - Grant webcam permissions when prompted by the browser. If camera access is denied, the application immediately transitions into Mouse Fallback Mode.

### 2.7 Configuration Organization Strategy

- Currently, runtime parameters and URLs are encapsulated in the top-level `CONFIG` object inside `index.html`.
- To maintain 100% backward compatibility and prevent premature fragmentation, `index.html` remains the working functional baseline in Phase 1 Step 2.
- In subsequent steps (Phase 1 Step 4), a dedicated configuration module (`src/config/AppConfig.js`) will centralize these parameters for imported ES modules without duplicating constants or breaking the standalone baseline.

---

## 3. Modular System Architecture (12 Core Subsystems)

```
                                 ┌──────────────────────────────────────────────────────────┐
                                 │                APPLICATION CORE (App.js)                 │
                                 │   - Lifecycle Management    - Fixed/Dynamic Time Step    │
                                 └────────────────────────────┬─────────────────────────────┘
                                                              │
                     ┌────────────────────────────────────────┼────────────────────────────────────────┐
                     ▼                                        ▼                                        ▼
      ┌─────────────────────────────┐          ┌─────────────────────────────┐          ┌─────────────────────────────┐
      │     VISION & TRACKING       │          │      CENTRAL TELEMETRY      │          │     SCENE & RENDERING       │
      │  - CameraManager            │          │  - StateManager             │          │  - SceneManager             │
      │  - HandTracker (MediaPipe)  │◄────────►│  - EventBus (Pub/Sub)       │◄────────►│  - HologramSystem           │
      │  - LandmarkProcessor        │          │  - AudioVoiceSystem         │          │  - ParticleEngine           │
      │  - GestureRecognizer        │          │                             │          │  - ShaderVFXEngine          │
      │  - GestureEventManager      │          │                             │          │                             │
      └─────────────────────────────┘          └─────────────────────────────┘          └─────────────────────────────┘
```

### Module 1: Application Core (`src/core/App.js` & `src/core/Engine.js`)
- **Responsibilities:**
  - Manages application initialization, startup synchronization, pause/resume, and teardown.
  - Controls the main render/simulation tick via `requestAnimationFrame` with precise elapsed delta time (`dt`) clamping ($[0.001, 0.05]$ seconds).
  - Handles window resize orchestration, device pixel ratio (DPR) limits, and browser visibility states (`visibilitychange`).
- **Dependencies:** Consumes `CameraManager`, `HandTracker`, `SceneManager`, `StateManager`, `EventBus`.

### Module 2: Webcam & Camera Manager (`src/camera/CameraManager.js`) [COMPLETED]
- **Responsibilities:**
  - Interfaces with `navigator.mediaDevices.getUserMedia()` to acquire video streams at optimal resolution ($1280 \times 720$ ideal, 60/30 FPS) with cascading constraint fallbacks.
  - Encapsulates clean API: `init(videoElement)`, `requestPermission()`, `start()`, `stop()`, `switchCamera()`, `getStream()`, `getVideoElement()`, `getStatus()`, and `dispose()`.
  - Manages stream permissions, front/user facing modes, and device change events (`devicechange`).
  - Synchronizes the HTML `<video id="webcam-video">` element with Three.js `VideoTexture` for background compositing and shader feeds.
  - Emits `Events.CAMERA_STATUS` and `Events.NOTIFICATION` into `EventBus` while updating `stateManager.state.camera`.
  - Provides graceful permission-denied, not-found, not-readable, and track-ended fallbacks into synthetic mouse tracking.
- **Dependencies:** Interacts directly with browser DOM and WebRTC APIs; consumes `AppConfig`, `EventBus`, `StateManager`.

### Module 3: MediaPipe Hand Tracking (`src/tracking/HandTracker.js`) [COMPLETED]
- **Responsibilities:**
  - Encapsulates MediaPipe Tasks Vision (`0.10.14`) `HandLandmarker` loading, GPU/CPU delegate management, and per-frame inference.
  - Implements clean public API: `init(videoElement)`, `initialize()`, `detect(timestamp, force)`, `getLandmarks()`, `getResults()`, `getStatus()`, `isReady()`, and `dispose()`.
  - Configures dual-hand tracking (`numHands: 2`) with `runningMode: 'VIDEO'`.
  - Implements automatic GPU-delegate initialization with transparent fallback to CPU execution if WebGL context creation fails, emitting `Events.TRACKER_INITIALIZED` and updating `StateManager`.
  - Throttles video frame inference to avoid redundant detection cycles when video timestamps have not advanced (`video.currentTime !== lastVideoTime`).
  - Returns safe, predictable landmark results (`landmarks`, `worldLandmarks`, `handedness`) without throwing runtime exceptions when no hands are in view.
- **Dependencies:** Consumes `CameraManager` video element, `AppConfig`, `EventBus`, and `StateManager`; supplies raw landmark detections to the landmark processing pipeline.

### Module 4: Hand Landmark Processing & Biomechanical Metrics (`src/tracking/LandmarkProcessor.js`) [COMPLETED]
- **Responsibilities:**
  - Extracts, categorizes, and processes raw 21-point landmarks for both Left and Right hands independently and simultaneously.
  - Implements horizontal coordinate mirroring ($u = 1.0 - x$) for mirrored webcam alignment with optical correctness.
  - Transforms normalized 2D camera coordinates into 3D Three.js world-space positions (`screenToWorld`) based on perspective camera FOV, aspect ratio, and depth ($Z$) without heap allocations.
  - Performs independent Exponential Moving Average (EMA) smoothing ($\alpha = 1.0 - e^{-\text{emaAlpha} \cdot dt}$) per hand, pre-allocating all 21 `THREE.Vector3` points to guarantee zero garbage-collection allocations in the 60 FPS animation loop.
  - Features instantaneous coordinate snap on initial detection or extended loss, coupled with a 150ms tracking-loss grace period (`trackingLossGraceMs`) to smooth over brief dropouts without coordinate jumping.
  - Resolves handedness classification from MediaPipe metadata with spatial horizontal wrist disambiguation for mirrored video feeds.
  - Implements sticky primary hand arbitration with hysteresis, preserving 100% backward compatibility for single-hand shaders, particles, and gestures.
  - Computes complete independent 3D spatial metrics: wrist position, palm center centroid, palm surface normal vector (oriented outward for palmar face), palm spatial orientation Euler angles (pitch, yaw, roll), hand width, hand length, hand scale, bounding sphere radius, and estimated depth.
  - Calculates vector-based geometric joint angles in degrees for all 15 anatomical joints across Thumb (CMC, MCP, IP), Index (MCP, PIP, DIP), Middle (MCP, PIP, DIP), Ring (MCP, PIP, DIP), and Pinky (MCP, PIP, DIP).
  - Derives anatomical joint flexion angles, normalized finger curl $[0.0, 1.0]$, normalized finger extension $[0.0, 1.0]$, thumb opposition ratio, and overall hand openness factor.
  - Provides synthetic landmark synthesis and full biomechanical metric calculation for Mouse Fallback mode via `processSynthetic()`.
- **Dependencies:** Consumes raw MediaPipe detections from `HandTracker` and pure spatial/angle helpers from `MathUtils`; updates `StateManager.updateTwoHandTracking()` and supplies smoothed 3D points and biomechanical metrics to downstream shaders, particles, and gesture evaluators.

### Module 5: Gesture Recognition Engine (`src/gestures/GestureRecognizer.js`)
- **Responsibilities:**
  - Evaluates geometric and spatial relationships across smoothed 3D landmarks and Phase 2 biomechanical metrics for each hand independently (`state.gestures.hands.left` and `state.gestures.hands.right`).
  - Implements Phase 3 Step 3.1 Open Palm and Closed Fist recognition with normalized finger curl, joint flexion angles, hand openness, and thumb opposition.
  - Coordinates specialized sub-detectors and combination engines (Phase 3 Steps 3.2 & 3.3):
    - `PinchDetector`: Independent thumb-to-index distance tracking with activation/release hysteresis and lifecycle transition events (`PINCH_START`, `PINCH_END`).
    - `SwipeDetector`: Independent directional kinematic swipe detection (`LEFT`, `RIGHT`, `UP`, `DOWN`) with timestamp velocity, dominant axis filtering, and discrete single-fire cooldowns.
    - `FingerDetector`: Independent 5-digit anatomical classification (`EXTENDED`, `CURLED`, `NEUTRAL`) for Thumb, Index, Middle, Ring, and Pinky with stability filtering.
    - `GestureCombinationEngine`: Composite, duration-based, sequential, and dual-hand combination recognition (Pinch+Hold, Double Pinch, Peace Sign+Hold, Pointing, Three-Finger, Two-Hand Pinch).
    - `GestureMapper`: Declarative, prioritized gesture-to-action semantic mapping layer emitting `ACTION_TRIGGERED`.
  - Implements per-hand temporal stability filtering and neutral `IDLE` state handling for ambiguous/transitional poses.
  - Synchronizes active primary hand gestures for downstream rendering systems (`state.gestures.currentGesture`, `fistFactor`, `openFactor`, `pinchFactor`, `spreadFactor`).
- **Dependencies:** Consumes data from `LandmarkProcessor`; coordinates sub-detectors, `GestureCombinationEngine`, and `GestureMapper`; updates `StateManager` and emits events through `EventBus`.

### Module 6: Gesture Event Manager (`src/gestures/GestureEventManager.js`)
- **Responsibilities:**
  - Transforms raw gesture classifications into rich, typed lifecycle events: `gesturestart`, `gesturechange`, `gestureend`, `gesturetap`.
  - Performs 3D spatial raycasting from hand pointers (index fingertip or pinch focal point) into the Three.js scene graph to detect collisions with holographic UI widgets.
  - Dispatches spatial drag, scale, and rotate transforms to focused 3D objects.
- **Dependencies:** Interfaces between `GestureRecognizer`, `EventBus`, and `SceneManager`.

### Module 7: Three.js Scene Manager (`src/scene/SceneManager.js`)
- **Responsibilities:**
  - Configures the Three.js WebGL 2 rendering pipeline, perspective cameras, ambient/directional lights, and environment maps.
  - Manages scene graph hierarchies divided into dedicated layers:
    1. Background Video Layer (composited/graded camera feed).
    2. Holographic UI Layer (HUD, rotating dials, status matrices).
    3. Interactive 3D Objects Layer (manipulable models, holographic cubes/cores).
    4. VFX & Particle Layer (energy arcs, flame particles, ice crystals).
  - Orchestrates multi-stage post-processing using `EffectComposer` (`RenderPass`, `UnrealBloomPass`, and custom GLSL chromatic aberration/vignette passes).
- **Dependencies:** Houses Three.js primitives; drives rendering output to the HTML `<canvas>`.

### Module 8: Holographic UI System (`src/ui/HologramSystem.js`)
- **Responsibilities:**
  - Builds and animates 3D futuristic holographic interface elements: circular targeting dials, rotary sliders, floating data wafers, spatial status rings, and mode switches.
  - Utilizes glowing wireframes, animated scanning grids, and emissive edge highlights with additive blending.
  - Exposes interactive states: Idle, Hovered (finger proximity), Active/Engaged (pinch/grab), and Disabled.
- **Dependencies:** Mounts inside `SceneManager`; receives interaction events from `GestureEventManager`.

### Module 9: Particle Physics Engine (`src/particles/ParticleEngine.js`)
- **Responsibilities:**
  - Manages high-performance GPU buffer-geometry particle clouds ($10,000+$ particles).
  - Computes physical behaviors: 3D simplex/curl noise turbulence, gravitational attraction towards fingertips/palm centers, repulsion force-fields, and inertia damping.
  - Implements velocity-aligned particle stretching to simulate fluid motion and dynamic speed streaks.
  - Reacts dynamically to active gestures (e.g., vortex swirl on Open Palm, atomic compression on Fist, radial shockwave on Spread).
- **Dependencies:** Renders inside `SceneManager`; driven by `LandmarkProcessor` and `StateManager`.

### Module 10: GLSL Shader & Visual Effects Engine (`src/vfx/ShaderVFXEngine.js`)
- **Responsibilities:**
  - Houses custom GLSL vertex and fragment shaders for elemental and energy visual effects:
    - **Lightning / Electric Arc:** Procedural branching noise shaders connecting fingertips or hands.
    - **Fire / Plasma Energy:** Volumetric raymarched or procedural noise shaders with turbulent heat shimmer.
    - **Cryo / Ice Crystals:** Sharp, faceted Voronoi refraction shaders with frosty crystalline glints.
    - **Hexagonal Energy Shield:** Pulsating forcefield surface with impact wave ripples at collision points.
  - Manages shader uniform updates (`uTime`, `uHandPositions`, `uEffectIntensity`, `uResolution`).
- **Dependencies:** Supplies shader materials to `SceneManager`.

### Module 11: Audio & Voice Command System (`src/audio/AudioVoiceSystem.js`)
- **Responsibilities:**
  - **Procedural Audio Synthesizer:** Uses the Web Audio API to generate real-time sci-fi sound effects (hologram clicks, hums, energy surges, whooshes) without external audio asset downloads.
  - **Voice Command Recognition:** Wraps the Web Speech API to recognize discrete spoken commands (e.g., *"Jarvis"*, *"Activate shield"*, *"Mode: Fire"*, *"Reset interface"*).
  - Emits voice-triggered events into `EventBus` to alter application states or trigger effects.
- **Dependencies:** Interacts with browser audio/speech APIs; connects to `EventBus` and `StateManager`.

### Module 12: Application Settings & State Management (`src/core/StateManager.js`)
- **Responsibilities:**
  - Provides a centralized, reactive state store holding global runtime parameters:
    - Active Experience Mode (`HOLOGRAPHIC`, `FIRE`, `LIGHTNING`, `CRYO`, `SHIELD`, `DIAGNOSTIC`).
    - Hand Tracking Status (Left/Right hand detected, landmarks count, tracking mode: Webcam vs Mouse).
    - Performance Metrics (real-time FPS, frame duration, GPU memory allocation, active particle count).
    - User Preferences (audio mute, bloom strength, particle density, camera mirroring).
  - Emits change events when states transition.
- **Dependencies:** Central hub referenced across all modules.

---

## 4. Inter-Module Communication Model

PROJECT NEXUS employs a **Hybrid Inter-Module Communication Architecture** that distinguishes between high-frequency numerical updates and discrete logical events:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                COMMUNICATION CHANNELS                                  │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│ 1. Direct Frame-State Ingestion (60 Hz)   │ 2. Publish/Subscribe Event Bus (Discrete)  │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ - Continuous numerical landmark arrays.   │ - Gesture state transitions (START/END).   │
│ - Pre-allocated Three.js Vector3/Matrix4. │ - Voice command activations.               │
│ - Zero GC garbage collection overhead.    │ - UI button taps & mode switches.          │
│ - Direct synchronous traversal in tick.   │ - Error and warning notifications.         │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

### Event Bus Contract (`src/core/EventBus.js`)
```javascript
// Example standard event signatures
eventBus.emit('gesture:change', { hand: 'right', gesture: 'PINCH', ratio: 0.18, pos: Vector3 });
eventBus.emit('ui:interact',    { targetId: 'mode-dial', action: 'SELECT', value: 'LIGHTNING' });
eventBus.emit('voice:command',  { phrase: 'ACTIVATE SHIELD', confidence: 0.94 });
eventBus.emit('system:mode',    { mode: 'CRYO', previous: 'FIRE' });
```

---

## 5. End-to-End Data Flow Pipeline

```
 ┌──────────────┐
 │ Webcam Input │ (1280x720 video stream via getUserMedia)
 └──────┬───────┘
        ▼
 ┌──────────────────────┐
 │ MediaPipe Tracking   │ (GPU HandLandmarker detectForVideo -> raw 21 normalized landmarks)
 └──────┬───────────────┘
        ▼
 ┌──────────────────────┐
 │ Landmark Processing  │ (Mirror u=1-x -> Frustum 3D projection -> EMA smoothing -> Palm metrics)
 └──────┬───────────────┘
        ▼
 ┌──────────────────────┐
 │ Gesture Recognition  │ (Finger curl analysis + distance ratios -> Hysteresis temporal validation)
 └──────┬───────────────┘
        ▼
 ┌──────────────────────┐
 │ Gesture Event Bus    │ (Dispatches 'gesture:change' -> 3D Raycasting hit-test -> Spatial drag/scale)
 └──────┬───────────────┘
        ▼
 ┌──────────────────────┐
 │ Three.js Scene Graph │ (Updates Holographic UI widgets, 3D object transforms, Particle attractors)
 └──────┬───────────────┘
        ▼
 ┌──────────────────────┐
 │ Particle Simulation  │ (Updates GPU buffer attributes -> Curl noise forces -> Velocity stretching)
 └──────┬───────────────┘
        ▼
 ┌──────────────────────┐
 │ GLSL Shader Pipeline │ (Injects uniforms: uTime, uHandPos, uMode -> Custom elemental shaders)
 └──────┬───────────────┘
        ▼
 ┌──────────────────────┐
 │ EffectComposer Post  │ (Scene render -> UnrealBloomPass -> Custom chromatic/vignette final pass)
 └──────┬───────────────┘
        ▼
 ┌──────────────────────┐
 │ Screen Presentation  │ (Crisp, anti-aliased 60 FPS output on WebGL Canvas overlay)
 └──────────────────────┘
```

### Mathematical Coordinate Transformation Formulation
MediaPipe reports normalized coordinates $(u, v, z_{\text{norm}})$ where $u, v \in [0, 1]$. To map these accurately into Three.js 3D world space aligned with the camera view frustum:

1. **Mirroring:**
   $$u_{\text{mirrored}} = 1.0 - u$$
2. **Depth Mapping:**
   $$Z_{\text{world}} = -z_{\text{norm}} \times \lambda_{\text{depth}} \quad (\text{default } \lambda_{\text{depth}} = 1.8)$$
3. **Frustum Size Calculation at Depth $Z_{\text{world}}$:**
   $$\text{Dist} = Z_{\text{camera}} - Z_{\text{world}}$$
   $$\text{Height} = 2.0 \cdot \text{Dist} \cdot \tan\left(\frac{\text{FOV}_{\text{rad}}}{2}\right)$$
   $$\text{Width} = \text{Height} \cdot \text{Aspect}$$
4. **World Position Derivation:**
   $$X_{\text{world}} = (u_{\text{mirrored}} - 0.5) \cdot \text{Width}$$
   $$Y_{\text{world}} = (0.5 - v) \cdot \text{Height}$$
   $$\vec{P}_{\text{world}} = \begin{bmatrix} X_{\text{world}} \\ Y_{\text{world}} \\ Z_{\text{world}} \end{bmatrix}$$

### 5.3 Gesture-Controlled Holographic Object Interaction Pipeline (Phase 4, Step 4.3)

Step 4.3 establishes spatial object interaction driven by dual-hand kinematics:

1. **Analytical Bounding Sphere Proximity & Hysteresis Hit-Testing:**
   Given controller position $\vec{P}_{\text{ctrl}}$ and object position $\vec{P}_{\text{obj}}$:
   $$d = \|\vec{P}_{\text{ctrl}} - \vec{P}_{\text{obj}}\|$$
   To prevent high-frequency jitter at object boundaries, a directional hysteresis buffer $\epsilon_{\text{tol}} = 0.08$ is enforced:
   $$\text{Threshold} = \begin{cases} R_{\text{obj}} + \epsilon_{\text{tol}} & \text{if hand was hovering } \text{obj} \\ R_{\text{obj}} & \text{otherwise} \end{cases}$$

2. **Deterministic Dual-Hand Conflict Arbitration:**
   - Left and right hands evaluate proximity independently.
   - If both hands attempt to pinch-select the same object simultaneously or sequentially, **first-hand ownership** is enforced: the hand that initiated the pinch retains selection; the second hand's selection attempt is ignored until the object is released.

3. **Pinch-and-Drag 3D Spatial Translation:**
   Upon selection engagement, a static 3D anchor offset is latched:
   $$\vec{P}_{\text{offset}} = \vec{P}_{\text{obj}} - \vec{P}_{\text{ctrl}}$$
   On each frame during continuous pinch, the target world position is smoothly tracked with exponential moving average damping:
   $$\vec{P}_{\text{target}} = \vec{P}_{\text{ctrl}} + \vec{P}_{\text{offset}}$$
   $$\vec{P}_{\text{obj}}(t + \Delta t) = \text{lerp}\left(\vec{P}_{\text{obj}}(t), \vec{P}_{\text{target}}, 1 - e^{-\alpha_{\text{drag}} \Delta t}\right)$$

4. **Visual State Progression:**
   - **IDLE:** Ambient wireframe, $1.0\times$ scale, electric sci-fi blue tint (`0x0077ff`), faint reticle brackets.
   - **HOVERED:** $1.10\times$ scale expansion, hand-specific color illumination (`0x00f0ff` Cyan for right, `0xa855f7` Violet for left), reticle brackets engage.
   - **SELECTED:** $1.18\times$ scale lock, luminous sky blue highlight (`0x38bdf8`), firm bracket alignment, 3D drag enabled.
   - **ACTIVATED:** $1.35\times$ scale burst, spin boost, luminous emerald flash (`0x22c55e`), discrete action payload executed.

### 5.4 GPU Buffer-Geometry Particle Engine Architecture (Phase 5, Step 5.1)

Step 5.1 implements a modular, high-density GPU particle architecture foundation replacing the legacy inline CPU loop:

1. **BufferGeometry Vertex Attribute Layout:**
   - `position` (`Float32Array`, $N \times 3$): Initial base 3D particle coordinates in world space.
   - `aVelocity` (`Float32Array`, $N \times 3$): Base velocity vector providing static displacement amplitude for GPU orbital drift.
   - `aPhase` (`Float32Array`, $N \times 1$): Individual particle phase offset for non-synchronized pulsation and harmonic orbit.
   - `aSize` (`Float32Array`, $N \times 1$): Individual base size multiplier ($0.5$ to $1.5$).
   - `aColor` (`Float32Array`, $N \times 3$): Per-particle RGB palette mix (cyan, electric blue, bright aqua).
   - `aLifetime` (`Float32Array`, $N \times 2$): Normalized age and lifespan parameters $(t_{\text{age}}, t_{\text{life}})$ reserved for future lifecycle and alpha fading functionality.

2. **GLSL Point Sprite Shader Pipeline & Procedural GPU Vertex Animation:**
   - **Vertex Attenuation & Procedural Orbital Displacement:**
     $$\text{pointSize} = uBaseSize \times aSize \times \text{pulsate} \times \left(\frac{uDpr}{-mvPosition.z}\right)$$
     Attenuated point size is clamped within $[1.0, 128.0]\text{ px}$ to prevent vertex explosion near the camera plane.
     When `uGpuMotion = 1.0`, the vertex shader computes closed-form harmonic orbital displacement directly on the GPU without per-frame CPU-to-GPU buffer re-uploads.
   - **Liquid Droplet Surface Normal Reconstruction (Fragment Shader):**
     Within point quad coordinates $(u, v) \in [0, 1]^2$, centered coordinate vector $\mathbf{c} = 2\mathbf{uv} - 1$ is tested against unit radius $r^2 = \mathbf{c} \cdot \mathbf{c}$.
     If $r^2 > 1.0$, the fragment is discarded via `discard`.
     Analytical hemisphere surface normal is derived as:
     $$\mathbf{N} = \begin{bmatrix} c_x \\ -c_y \\ \sqrt{1 - r^2} \end{bmatrix}$$
   - **Holographic Droplet Shading & Additive Blending:**
     - Blending mode: `THREE.AdditiveBlending` with `depthWrite: false` and `transparent: true`.
     - Specular Glint: $(\max(0.0, \mathbf{N} \cdot \mathbf{H}))^{32.0} \times \text{specularColor}$.
     - Fresnel Rim Glow: $(1.0 - N_z)^{3.2} \times \text{rimColor}$.
     - Edge Anti-Aliasing: $\alpha = (1.0 - \text{smoothstep}(0.80, 1.0, r^2)) \times uOpacity$ enforcing valid GLSL edge ordering ($edge0 < edge1$).

3. **CPU/GPU Responsibility Separation & Dynamic Scaling:**
   - **CPU:** Allocates buffer geometry once to `maxCount` (15,000 particles); scales active density in $O(1)$ time via `geometry.setDrawRange(0, count)`; synchronizes state with `StateManager` and bidirectional `EventBus` commands.
   - **GPU:** Evaluates procedural motion and point size attenuation in vertex shaders; computes droplet normal, specular glint, and Fresnel rim in fragment shaders.
   - **Frustum Culling Policy:** The `THREE.Points` object intentionally sets `frustumCulled = false` (consistent with `displayQuadMesh` and `sdfQuadMesh`), bypassing CPU-side frustum tests because procedural GPU vertex displacement and screen-space point attenuation cause static CPU geometry bounding volumes to be unrepresentative of dynamic particle extents.
   - **Scope Discipline:** Hand-landmark attractors/repulsors and gesture-triggered dynamics are decoupled from Step 5.1 and reserved for Steps 5.3 and 5.4.

### 5.5 Configurable Particle Attraction & Repulsion Force Fields (Phase 5, Step 5.2)

Step 5.2 implements a configurable GPU-side attraction and repulsion force field for the particle system:

1. **Vertex Shader Displacement Formulation (`particle.vert` & `ParticleShaders.js`):**
   - Displacement is evaluated procedurally on the GPU per vertex without CPU buffer integration:
     $$\mathbf{d} = \mathbf{p}_{\text{center}} - \mathbf{p}_{\text{base}}$$
     $$\text{dist} = \|\mathbf{d}\|$$
   - Boundary culling: if $\text{dist} \ge R$ (where $R = \text{uForceRadius}$), displacement is strictly $\mathbf{0}$.
   - Continuous falloff curve:
     $$f(d) = \left(\text{clamp}\left(1.0 - \frac{d}{R}, 0.0, 1.0\right)\right)^{\text{falloff}}$$
   - Direction vector with soft-core stabilization preventing division-by-zero or numerical explosion at the center:
     $$\mathbf{dir} = \frac{\mathbf{d}}{\max(0.02, \text{dist})}$$
   - **Attraction Mode (`uForceType = +1.0`):** Pulls particles toward the interaction center, bounded by $\min(\text{dist}, \dots)$ to guarantee particles never overshoot past the center:
     $$\Delta \mathbf{p} = \mathbf{dir} \times \min(\text{dist}, \min(S \times f(d), \text{maxDist})) \times \text{weight}$$
   - **Repulsion Mode (`uForceType = -1.0`):** Pushes particles outward away from the center:
     $$\Delta \mathbf{p} = -\mathbf{dir} \times \min(S \times f(d), \text{maxDist}) \times \text{weight}$$

2. **Temporal Smoothing & Transition Lifecycle (CPU-Side):**
   - Activation, deactivation, and position transitions are smoothly interpolated in the 60 FPS update loop:
     $$\alpha = 1.0 - \exp(-\lambda \cdot \Delta t), \quad \lambda = 12.0$$
   - `clearForceField()` fades target weight to zero; particles smoothly return to natural autonomous orbital flow without snapping.
   - Initial activation snaps the center point if previous weight was zero, preventing cross-screen particle sweeping.

3. **API & Decoupled State Integration:**
   - `particleEngine.setAttractor(position, options)`
   - `particleEngine.setRepulsor(position, options)`
   - `particleEngine.setForceField(mode, position, options)`
   - `particleEngine.updateForceField(position, options)`
   - `particleEngine.clearForceField()`
   - `particleEngine.getForceFieldState()`
   - Synchronized with `StateManager.state.rendering.particles.forceField` and `EventBus` (`PARTICLE_FORCE_FIELD`).

4. **Hand-Controlled Particle Interaction (Phase 5, Step 5.3):**
   - **Dual-Hand Force Field Uniforms in Vertex Shader:**
     - Field 1 (`uForce*`): Driven by Right Hand (or manual force field when programmatic API is active).
     - Field 2 (`uForce2*`): Driven by Left Hand.
     - Vectorial displacement accumulation: $\mathbf{d}_{\text{total}} = \mathbf{d}_1 + \mathbf{d}_2$, clamped to $\max(M_1, M_2)$ to guarantee numerical stability.
   - **Single-Hand & Two-Hand Interaction Modes:**
     - Left hand defaults to `'repel'` (pusher/shield dynamic); Right hand defaults to `'attract'` (gravitational attractor).
     - `singleHandMode` override dynamically unifies force type when only one hand is in the camera view if configured.
   - **Tracking Loss Grace & Reacquisition Snapping:**
     - 150ms grace window prevents particle field collapse during transient tracking loss or occlusions.
     - Exponential fade-out ($\lambda = 10.0$) smoothly returns particles to natural orbital mist when tracking is lost.
     - Positional snapping upon reacquisition resets coordinates without dragging or sweeping particles across the viewport.
   - **APIs & State Integration:**
     - `particleEngine.updateHandInteraction(controllers, dt, currentTimeMs)`
     - `particleEngine.setHandMode(hand, mode)`
     - `particleEngine.setHandForceField(hand, options)`
     - `particleEngine.setHandInteractionEnabled(enabled)`
     - `particleEngine.getHandForceState(hand)`
     - Synchronized with `StateManager.state.rendering.particles.handInteraction` and `EventBus` (`PARTICLE_HAND_INTERACTION`).

---

## 6. Proposed Project Folder Structure

The project structure is designed to be cleanly modularized, allowing step-by-step implementation across the roadmap while preserving all existing legacy assets:

```text
/Users/kunalsengar/Documents/Venom/
├── index.html                     # Entry HTML viewport (preserved & evolves with modular script loader)
├── README.md                      # Project documentation (preserved)
├── PROJECT_ARCHITECTURE.md        # [THIS FILE] System architectural blueprint
├── DEVELOPMENT_ROADMAP.md         # 8-Phase, 32-Step Development Roadmap
│
├── assets/                        # Static binary resources (future 3D models, textures, icons)
│   ├── models/                    # GLTF/GLB holographic 3D assets
│   └── audio/                     # Fallback audio assets (if non-procedural)
│
├── styles/                        # Modular CSS presentation
│   ├── main.css                   # Core layout, reset, and viewport styling
│   └── hud.css                    # Monospace HUD and telemetry styles
│
└── src/                           # JavaScript ES Module Application Core
    ├── config/                    # Configuration Layer (Phase 1, Step 4) [COMPLETED]
    │   └── AppConfig.js           # Centralized, frozen application parameters
    │
    ├── core/                      # Core runtime infrastructure [COMPLETED]
    │   ├── EventBus.js            # Pub/Sub decoupled typed message bus
    │   └── StateManager.js        # Domain-categorized reactive state store
    │
    ├── ui/                        # Presentation & HUD Controls [COMPLETED]
    │   ├── UIManager.js           # HUD presentation, telemetry, mode selection
    │   ├── HologramSystem.js      # (Phase 4) Hologram scene graph layer and container
    │   ├── DialWidget.js          # (Phase 4) Rotating circular sci-fi HUD dials
    │   └── StatusMatrix.js        # (Phase 4) Real-time telemetry matrix panel
    │
    ├── utils/                     # Mathematical & Spatial Utilities [COMPLETED]
    │   └── MathUtils.js           # Spatial projection, vector angles, palm normal & orientation
    │
    ├── camera/                    # Video and camera capture (Phase 2, Step 2.1) [COMPLETED]
    │   └── CameraManager.js       # MediaDevices acquisition and video texture binding
    │
    ├── tracking/                  # Computer vision and hand kinematics (Phase 2) [COMPLETED]
    │   ├── HandTracker.js         # MediaPipe Tasks Vision wrapper (Phase 2, Step 2.2) [COMPLETED]
    │   └── LandmarkProcessor.js   # 3D Projection, EMA Smoothing & Biomechanical Metrics (Phase 2, Step 2.4) [COMPLETED]
    │
    ├── gestures/                  # Gesture recognition and spatial interaction (Phase 3)
    │   ├── GestureRecognizer.js   # Biomechanical gesture coordinator & core classifier (Phase 3, Step 3.1) [COMPLETED]
    │   ├── PinchDetector.js       # Independent pinch lifecycle detector (Phase 3, Step 3.2) [COMPLETED]
    │   ├── SwipeDetector.js       # Directional swipe detector with cooldown (Phase 3, Step 3.2) [COMPLETED]
    │   ├── FingerDetector.js      # Individual 5-finger anatomical classifier (Phase 3, Step 3.2) [COMPLETED]
    │   ├── GestureCombinationEngine.js # Composite, duration & two-hand combinations (Phase 3, Step 3.3) [COMPLETED]
    │   ├── GestureMapper.js       # Semantic gesture-to-action mapping layer (Phase 3, Step 3.3) [COMPLETED]
    │   ├── GestureProfiles.js     # Single and dual hand anatomical configurations [PENDING]
    │   └── GestureEventManager.js # 3D spatial raycasting & hit-testing [PENDING]
    │
    ├── hologram/                  # 3D Holographic Interface Foundation (Phase 4, Step 4.1 & 4.3) [COMPLETED]
    │   ├── HologramObject.js      # Extensible base holographic entity with cascading transforms & opacity
    │   ├── HologramMaterials.js   # Centralized holographic shaders, wireframe, Fresnel rim glow, grid materials
    │   ├── HologramEffects.js     # Procedural pulse, harmonic oscillation, and zero-allocation math helpers
    │   ├── HologramGrid.js        # Spatial ground reference plane with distance attenuation & radial rings
    │   ├── HologramRings.js       # Concentric multi-tier counter-rotating 3D gimbal rings
    │   ├── HologramCore.js        # Central layered geometric power core with breathing crystal & cage
    │   ├── HologramCursor.js      # 3D interactive holographic reticle with gestural contraction/expansion (Phase 4, Step 4.2)
    │   ├── InteractableHologram.js # Extensible interactable holographic entity with state feedback, persistent transforms (userScale, userRotation), and reticle brackets (Phase 4, Step 4.3 & 4.4)
    │   ├── HologramScene.js       # Holographic scene graph layer mounting to Three.js scene
    │   └── HologramManager.js     # Central coordinator, lifecycle management & runtime debug telemetry
    │
    ├── interaction/               # Dual-Hand 3D Interaction Engine (Phase 4, Step 4.2–4.4) [IN PROGRESS]
    │   ├── HandController.js      # Independent left & right 3D hand controllers with EMA smoothing & velocity
    │   ├── TwoHandMetrics.js      # Dual-hand spatial metrics (distance, midpoint, deltas, span ratio)
    │   ├── HolographicObjectManager.js # Gesture-controlled object interaction manager, proximity hit-testing, drag coordinator & two-hand RST engine (Phase 4, Step 4.3 & 4.4)
    │   └── InteractionEngine.js   # Master interaction coordinator, StateManager sync & lifecycle events
    │
    ├── scene/                     # Three.js 3D rendering environment (Phase 4)
    │   ├── SceneManager.js        # Three.js scene, camera, lighting, and viewport setup
    │   └── PostProcessor.js       # EffectComposer, Bloom, and custom passes
    │
    ├── ui/                        # Holographic interface widgets
    │   ├── HologramSystem.js      # Hologram scene graph layer and container
    │   ├── DialWidget.js          # Rotating circular sci-fi HUD dials
    │   ├── StatusMatrix.js        # Real-time telemetry matrix panel
    │   └── ModeSelector.js        # 3D spatial elemental mode selector
    │
    ├── particles/                 # Particle physics systems (Phase 5) [IN PROGRESS]
    │   ├── ParticleEngine.js      # Singleton GPU buffer-geometry particle simulation controller
    │   ├── ParticleShaders.js     # Custom ShaderMaterial factory, uniforms & embedded GLSL shaders
    │   └── ForceFields.js         # (Phase 5, Step 5.2) Simplex/curl noise, attraction & repulsion fields
    │
    ├── vfx/                       # Elemental visual effects & superpowers
    │   ├── ShaderVFXEngine.js     # Elemental shader and effect coordinator
    │   ├── LightningEffect.js     # Procedural branching electric arcs
    │   ├── FirePlasmaEffect.js    # Volumetric fire and plasma energy
    │   ├── CryoIceEffect.js       # Faceted crystalline Voronoi frost
    │   └── ForcefieldEffect.js    # Hexagonal interactive energy shield
    │
    ├── shaders/                   # Pure GLSL shader source files
    │   ├── vfx/                   # Elemental shader programs (.vert, .frag)
    │   │   ├── particle.vert      # GPU particle vertex shader (attenuation, orbital displacement)
    │   │   └── particle.frag      # GPU particle fragment shader (droplet normal, glint, Fresnel rim)
    │   └── post/                  # Custom post-processing shader programs (.frag)
    │
    ├── audio/                     # Audio and voice systems
    │   ├── AudioSystem.js         # Web Audio API procedural sound synthesizer
    │   └── VoiceRecognizer.js     # Web Speech API voice command listener
    │
    └── utils/                     # Shared math, geometry & helper utilities
        ├── MathUtils.js           # Vector math, clamping, and interpolation
        └── Noise.js               # Fast procedural 3D simplex and curl noise
```

---

## 7. Integration & Adaptation Strategy (Preserving Existing Code)

Existing files in the repository:
- `index.html`: Contains a monolithic, tested, single-file proof-of-concept demonstrating MediaPipe integration, coordinate projection, mouse fallback, basic gesture detection, particle physics, and post-processing.
- `README.md`: Documents existing controls and setup.

### Evolution Plan
1. **Preservation:** The existing `index.html` remains fully intact and functioning throughout Phase 1 Step 1.
2. **Modular Extraction:** In subsequent steps (starting in Phase 1 Step 2), specific tested components from `index.html` (such as `screenToWorld` projection math, EMA smoothing algorithms, and mouse fallback landmark synthesis) will be factored into discrete ES modules inside `src/`.
3. **No Breaking Changes:** The modular code will be developed cleanly alongside the existing code, ensuring backward compatibility and immediate verification at every step.

---

## 8. Scalability, Performance & Browser-First Guarantees

1. **Memory Stability (Zero Allocations in Loop):**
   - No `new THREE.Vector3()` or array allocations inside `animate()` or tracking loops.
   - All intermediate operations reuse static scratch variables (`_scratchVec`, `_scratchQuat`, `_scratchMat`).
2. **Adaptive Resolution Scaling:**
   - Telemetry tracks trailing rolling frame duration. If frame rate drops below 40 FPS, the post-processing and offscreen render targets dynamically downscale to $0.5\times$ resolution. When performance recovers above 55 FPS, full resolution is restored.
3. **DPR Clamping:**
   - Device pixel ratio is strictly clamped to a maximum of `2.0` to prevent GPU memory saturation on high-density Retina displays.
4. **Bounding-Volume Acceleration:**
   - Spatial raymarching or hit-testing calculates analytical bounding sphere intersections before invoking complex per-fragment or per-vertex calculations.
