/**
 * PROJECT NEXUS — Application Configuration
 * Centralized, frozen configuration layer separating parameters from implementation logic.
 *
 * @module config/AppConfig
 */

export const AppConfig = Object.freeze({
  /**
   * Application Metadata & Branding
   */
  app: Object.freeze({
    name: 'PROJECT NEXUS',
    version: '1.0.0',
    systemTag: 'SYSTEM v1.0 // SPATIAL CORE',
    description: 'Futuristic Gesture-Controlled Spatial 3D Experience'
  }),

  /**
   * Rendering & Viewport Parameters
   */
  rendering: Object.freeze({
    cameraFov: 50,
    cameraNear: 0.1,
    cameraFar: 100,
    cameraZ: 4.8,
    maxDpr: 2,
    initialResScale: 0.65,       // Raymarch render target scale (0.50 to 0.75)
    minResScale: 0.50,           // Adaptive low-end scale when FPS drops
    maxResScale: 0.75,           // Maximum high-quality scale
    maxRaymarchSteps: 48,        // Strict 48 step cap for 60 FPS performance
    targetFps: 60
  }),

  /**
   * Dedicated Camera Configuration Parameters (Phase 2, Step 2.1)
   */
  camera: Object.freeze({
    idealWidth: 1280,
    idealHeight: 720,
    facingMode: 'user',
    idealFrameRate: 60,
    minFrameRate: 30
  }),

  /**
   * Camera & MediaPipe HandLandmarker Parameters
   */
  tracking: Object.freeze({
    wasmPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    numHands: 2,
    maxHands: 2,
    runningMode: 'VIDEO',
    delegate: 'GPU',
    cpuFallbackDelegate: 'CPU',
    emaAlpha: 24.0,              // EMA smoothing coefficient (1.0 - exp(-24.0 * dt))
    trackingLossGraceMs: 150,    // Tracking loss grace window in ms before re-snapping
    primaryHandPreference: 'right', // Default primary hand preference when dual hands visible
    videoIdealWidth: 1280,
    videoIdealHeight: 720,
    wasmTimeoutMs: 12000,           // Max time to load MediaPipe WASM runtime
    gpuInitTimeoutMs: 8000,         // Max time for GPU delegate before fallback to CPU
    cpuInitTimeoutMs: 12000,        // Max time for CPU delegate before fallback to mouse
    startupWatchdogMs: 25000        // Global watchdog timeout to guarantee loading screen dismissal
  }),

  /**
   * Biomechanical Metrics Configuration (Phase 2, Step 2.4)
   */
  biomechanics: Object.freeze({
    fingerMaxFlexionDeg: 220.0,  // Reference degrees for full finger curl (MCP+PIP+DIP)
    thumbMaxFlexionDeg: 130.0,   // Reference degrees for full thumb curl (MCP+IP)
    thumbOppositionScale: 1.3,   // Scale multiplier for opposition distance
    minHandScale: 0.12,          // Guard for minimum anatomical hand scale
    depthScale: 1.8              // World Z mapping scale multiplier
  }),

  /**
   * Biomechanical Gesture Detection & Recognition Thresholds (Phase 3, Step 3.1)
   */
  gestures: Object.freeze({
    // Pinch & Spread Thresholds (Preserved from Phase 1-2)
    pinchThreshold: 0.25,        // d / handSize < 0.25 = PINCH
    pinchSnapThreshold: 1.25,    // d / handSize > 1.25 = SNAP
    spreadSpeedThreshold: 1.85,  // Fast hand speed triggers SPREAD burst
    hysteresisFrames: 3,         // Consecutive stable frames required to commit gesture
    morphSpeed: 10.0,            // Morph factor transition rate (1.0 - exp(-10.0 * dt))

    // Minimum detection confidence for gesture classification
    minConfidence: 0.45,

    // Open Palm Recognition Thresholds (Biomechanical & Anatomical)
    openPalm: Object.freeze({
      minOpenness: 0.65,         // Overall hand openness [0.0 - 1.0]
      minFingerExtension: 0.65,  // Minimum normalized extension for index, middle, ring, pinky
      maxFingerCurl: 0.35,       // Maximum allowed curl for extended fingers
      minThumbExtension: 0.40,   // Minimum thumb extension
      maxThumbFlexionDeg: 65.0   // Maximum total flexion degrees for thumb (MCP+IP)
    }),

    // Fist Recognition Thresholds (Biomechanical & Anatomical)
    fist: Object.freeze({
      maxOpenness: 0.30,         // Overall hand openness must be <= 0.30
      minFingerCurl: 0.65,       // Minimum normalized curl for index, middle, ring, pinky
      maxFingerExtension: 0.35,  // Maximum allowed extension for curled fingers
      minThumbCurl: 0.45,        // Minimum thumb curl
      minThumbOpposition: 0.30,  // Thumb must be tucked inward over fingers/palm
      minFlexionTotalDeg: 130.0  // Minimum finger flexion total (MCP+PIP+DIP) per finger
    }),

    // Transition & Temporal Filtering
    transition: Object.freeze({
      holdDurationMs: 65,        // Temporal duration hand pose must remain stable (~3-4 frames at 60fps)
      handLossResetGraceMs: 200  // Delay after hand loss before resetting gesture to IDLE
    }),

    // Pinch Detection Parameters (Phase 3, Step 3.2)
    pinch: Object.freeze({
      activationDistance: 0.22,  // Normalized distance threshold (d / handSize) to activate pinch
      releaseDistance: 0.30,     // Normalized distance threshold (d / handSize) to release pinch (hysteresis)
      snapThreshold: 1.25,       // Maximum distance ratio for bridge snap
      hysteresisFrames: 2        // Frames required to confirm pinch state transition
    }),

    // Directional Swipe Detection Parameters (Phase 3, Step 3.2)
    swipe: Object.freeze({
      minVelocity: 1.5,          // Minimum kinematic speed (units/sec) to qualify as a swipe
      minDisplacement: 0.20,     // Minimum displacement relative to handSize
      maxDurationMs: 320,        // Maximum gesture time window in milliseconds
      cooldownMs: 350,           // Cooldown period in ms to prevent duplicate triggers
      axisDominanceRatio: 1.35   // Minimum ratio of primary axis displacement over secondary axis
    }),

    // Individual Finger State Classification Thresholds (Phase 3, Step 3.2)
    fingers: Object.freeze({
      minExtension: 0.65,        // Minimum normalized extension for EXTENDED
      maxCurl: 0.35,             // Maximum normalized curl for EXTENDED
      minCurl: 0.65,             // Minimum normalized curl for CURLED
      maxExtension: 0.35,        // Maximum normalized extension for CURLED
      thumb: Object.freeze({
        minExtension: 0.55,      // Thumb normalized extension threshold for EXTENDED
        maxFlexionDeg: 60.0,     // Max thumb flexion degrees (MCP+IP) for EXTENDED
        minCurl: 0.50,           // Thumb normalized curl threshold for CURLED
        minOpposition: 0.35      // Thumb opposition ratio threshold for CURLED
      }),
      stabilityFrames: 2         // Temporal stability frames to confirm finger state transition
    })
  }),

  /**
   * Advanced Gesture Combinations Configuration (Phase 3, Step 3.3)
   */
  combinations: Object.freeze({
    pinchHold: Object.freeze({
      holdDurationMs: 450,       // Duration required to confirm pinch hold
      cooldownMs: 300
    }),
    doublePinch: Object.freeze({
      windowMs: 420,             // Max window between two distinct pinch activations
      minIntervalMs: 80,         // Min interval between pinches to prevent flicker false positives
      cooldownMs: 350
    }),
    peaceSign: Object.freeze({
      holdDurationMs: 350,       // Duration required to confirm peace sign hold
      thumbTolerance: 'ANY',     // 'ANY' | 'CURLED_OR_NEUTRAL'
      cooldownMs: 400
    }),
    pointing: Object.freeze({
      stabilityFrames: 2,        // Consecutive frames to confirm pointing
      thumbTolerance: 'ANY',     // 'ANY' | 'CURLED_OR_NEUTRAL'
      cooldownMs: 250
    }),
    threeFinger: Object.freeze({
      stabilityFrames: 2,        // Consecutive frames to confirm three-finger
      thumbTolerance: 'ANY',     // 'ANY' | 'CURLED_OR_NEUTRAL'
      cooldownMs: 250
    }),
    twoHandPinch: Object.freeze({
      stabilityFrames: 2,        // Consecutive frames both hands must be pinching
      cooldownMs: 400
    })
  }),

  /**
   * Custom Gesture Mapping Configuration (Phase 3, Step 3.3)
   */
  gestureMapping: Object.freeze({
    enabled: true,
    defaultActionCooldownMs: 250,
    mappings: Object.freeze([
      {
        gesture: 'PINCH_HOLD_START',
        action: 'SELECT',
        priority: 10,
        enabled: true,
        exclusive: true,
        cooldownMs: 300
      },
      {
        gesture: 'DOUBLE_PINCH',
        action: 'DOUBLE_SELECT',
        priority: 20,
        enabled: true,
        exclusive: true,
        cooldownMs: 400
      },
      {
        gesture: 'PEACE_SIGN_HOLD',
        action: 'SPECIAL_ACTION',
        priority: 15,
        enabled: true,
        exclusive: true,
        cooldownMs: 400
      },
      {
        gesture: 'POINTING',
        action: 'POINT',
        priority: 5,
        enabled: true,
        exclusive: false,
        cooldownMs: 200
      },
      {
        gesture: 'THREE_FINGER',
        action: 'MENU_TOGGLE',
        priority: 15,
        enabled: true,
        exclusive: true,
        cooldownMs: 400
      },
      {
        gesture: 'BOTH_HANDS_PINCH_START',
        action: 'TWO_HAND_CONTROL',
        priority: 25,
        enabled: true,
        exclusive: true,
        cooldownMs: 400
      }
    ])
  }),

  /**
   * 3D Holographic Interface Parameters (Phase 4, Step 4.1)
   */
  hologram: Object.freeze({
    enabled: true,
    opacity: 0.85,
    colors: Object.freeze({
      primary: 0x00f0ff,         // Electric cyan
      secondary: 0x0077ff,       // Electric sci-fi blue
      accent: 0xa855f7,          // Holographic purple / violet
      ambient: 0x002244,         // Deep space cyan-blue
      grid: 0x004488,            // Subtle grid line tint
      core: 0x38bdf8             // Core reactor luminous sky blue
    }),
    grid: Object.freeze({
      enabled: true,
      size: 14.0,                // Spatial grid plane extent
      divisions: 28,             // Grid divisions count
      color: 0x004488,           // Grid line base color
      opacity: 0.22,             // Subtle spatial reference opacity
      yOffset: -1.4,             // Base Y plane offset
      pulseSpeed: 0.8,           // Scanline / breathing speed
      maxRadius: 6.5             // Edge fade radius for circular falloff
    }),
    rings: Object.freeze({
      enabled: true,
      count: 3,                  // Number of concentric rings
      radius: Object.freeze([0.85, 1.25, 1.70]), // Concentric radii
      tubeRadius: 0.008,         // Thickness of rings
      rotationSpeeds: Object.freeze([0.35, -0.22, 0.15]), // Multi-axis counter-rotation
      tilts: Object.freeze([
        [0.26, 0.0, 0.0],        // Pitch/roll/yaw tilt in radians
        [-0.40, 0.18, 0.0],
        [0.15, -0.32, 0.20]
      ]),
      opacity: 0.45,             // Ring glow opacity
      pulseSpeed: 1.6            // Ring luminance oscillation rate
    }),
    core: Object.freeze({
      enabled: true,
      radius: 0.38,              // Core 3D volume radius
      pulseSpeed: 2.2,           // Core breathing rate
      pulseScale: 0.12,          // Scale breathing amplitude
      rotationSpeed: 0.65,       // Rotation speed
      wireframe: true,
      opacity: 0.70,             // Core opacity
      yOffset: 0.0               // Center elevation
    })
  }),

  /**
   * Dual-Hand 3D Interaction Engine Parameters (Phase 4, Step 4.2)
   */
  interaction: Object.freeze({
    enabled: true,
    smoothingAlpha: 20.0,        // Exponential moving average rate for cursor tracking
    lossFadeSpeed: 9.0,          // Opacity fade-out speed when hand tracking is lost
    cursor: Object.freeze({
      reticleRadius: 0.065,      // Base outer reticle radius
      innerDotRadius: 0.012,     // Center focal dot radius
      pinchContractScale: 0.52,  // Reticle scale when pinching
      openExpandScale: 1.28,     // Reticle scale when open palm
      fistContractScale: 0.68,   // Reticle scale when fist clench
      pulseSpeed: 3.2,           // Idle reticle breathing pulse
      baseOpacity: 0.90,         // Target cursor opacity when tracked
      colors: Object.freeze({
        right: 0x00f0ff,         // Primary / Right Hand: Electric cyan
        left: 0xa855f7,          // Secondary / Left Hand: Electric violet / purple
        pinchGlow: 0x38bdf8,     // Highlight glow color on pinch
        fistGlow: 0xff4466       // Clench indicator tint
      })
    }),
    twoHand: Object.freeze({
      minSpanDistance: 0.08,     // Minimum measurable hand distance in world units
      maxSpanDistance: 5.0,      // Maximum clamp threshold
      spanHysteresisMs: 80       // Grace duration for two-hand transitions
    }),
    objects: Object.freeze({
      targetingTolerance: 0.08,  // Hysteresis distance buffer to prevent edge flickering
      hoverDistance: 0.42,       // Proximity threshold for 3D cursor-to-object hover
      hoverLerpSpeed: 14.0,      // Exponential lerp rate for hover scale & glow
      dragSmoothing: 22.0,       // Lerp smoothing rate for pinch-and-drag translation
      actionCooldownMs: 250,     // Debounce window between discrete gesture activations
      colors: Object.freeze({
        idle: 0x0077ff,          // Idle ambient wireframe: Electric sci-fi blue
        hoverLeft: 0xa855f7,     // Left hand hover: Holographic purple / violet
        hoverRight: 0x00f0ff,    // Right hand hover: Luminous electric cyan
        selected: 0x38bdf8,      // Active selection / pinch: Luminous sky blue
        activated: 0x22c55e      // Kinetic activation pulse: Luminous emerald
      })
    })
  }),

  /**
   * Accent Droplets / Particle System Parameters
   */
  particles: Object.freeze({
    count: 3000,                 // 3,000 fluid droplet particles
    baseSize: 11.0,              // Point size multiplier
    anchorLandmarks: Object.freeze([4, 8, 12, 16, 20, 0, 5, 9, 17])
  }),

  /**
   * Visual Effects & Post-Processing Parameters
   */
  vfx: Object.freeze({
    bloomStrength: 0.62,
    bloomRadius: 0.40,
    bloomThreshold: 0.82
  }),

  /**
   * UI Experience Modes
   */
  ui: Object.freeze({
    modes: Object.freeze([
      {
        id: 'hologram',
        name: 'Hologram Mode',
        badge: 'ACTIVE',
        active: true,
        disabled: false,
        desc: 'Interactive spatial 3D holographic projection & hand manipulation.'
      },
      {
        id: 'particle',
        name: 'Particle Mode',
        badge: 'READY',
        active: false,
        disabled: false,
        desc: 'GPU particle physics simulation responding dynamically to gestural fields.'
      },
      {
        id: 'energy',
        name: 'Energy Mode',
        badge: 'READY',
        active: false,
        disabled: false,
        desc: 'Cinematic energy tendrils, electric arcs, and volumetric liquid dynamics.'
      },
      {
        id: 'combat',
        name: 'Combat Mode',
        badge: 'PHASE 6',
        active: false,
        disabled: true,
        desc: 'Repulsor blasts, force fields, and dual-hand kinetic combat targeting.'
      },
      {
        id: 'diagnostic',
        name: 'Diagnostic Mode',
        badge: 'PHASE 7',
        active: false,
        disabled: true,
        desc: 'Full biomechanical mesh diagnostics, landmark inspection, and telemetry.'
      }
    ])
  })
});
