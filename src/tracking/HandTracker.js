/**
 * PROJECT NEXUS — HandTracker
 * Dedicated MediaPipe HandLandmarker initialization, GPU/CPU delegate management,
 * and per-frame video hand tracking module.
 *
 * @module tracking/HandTracker
 */

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { AppConfig } from '../config/AppConfig.js';
import { Events, eventBus } from '../core/EventBus.js';
import { stateManager } from '../core/StateManager.js';

/**
 * Race a promise against a timeout to prevent unresolved hangs during WebGL/WASM initialization.
 * @param {Promise<any>} promise
 * @param {number} ms - Timeout in milliseconds
 * @param {string} errorMsg - Rejection message on timeout
 * @returns {Promise<any>}
 */
function withTimeout(promise, ms, errorMsg = 'Operation timed out') {
  return new Promise((resolve, reject) => {
    let timer = setTimeout(() => {
      timer = null;
      reject(new Error(errorMsg));
    }, ms);

    promise.then(
      (res) => {
        if (timer) {
          clearTimeout(timer);
          resolve(res);
        }
      },
      (err) => {
        if (timer) {
          clearTimeout(timer);
          reject(err);
        }
      }
    );
  });
}

export class HandTracker {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.wasmPath]
   * @param {string} [options.modelAssetPath]
   * @param {number} [options.numHands]
   * @param {string} [options.runningMode]
   */
  constructor(options = {}) {
    /** @type {HTMLVideoElement|null} */
    this._videoEl = null;

    /** @type {HandLandmarker|null} */
    this._detector = null;

    /** @type {string} 'GPU' | 'CPU' | 'NONE' */
    this._delegate = 'NONE';

    this._isReady = false;
    this._isInitializing = false;
    /** @type {Promise<HandLandmarker>|null} */
    this._initPromise = null;

    this._wasmPath = options.wasmPath || AppConfig.tracking.wasmPath;
    this._modelAssetPath = options.modelAssetPath || AppConfig.tracking.modelAssetPath;
    this._numHands = options.numHands || AppConfig.tracking.numHands || 2;
    this._runningMode = options.runningMode || AppConfig.tracking.runningMode || 'VIDEO';

    this._lastVideoTime = -1;
    this._lastResults = null;
    /** @type {Array<Array<{x: number, y: number, z: number}>>} */
    this._lastLandmarks = [];
  }

  /**
   * Bind video element for detection inference
   * @param {HTMLVideoElement|string} [videoElementOrId='#webcam-video']
   * @returns {HandTracker}
   */
  init(videoElementOrId = '#webcam-video') {
    if (typeof videoElementOrId === 'string') {
      const el = document.querySelector(videoElementOrId);
      this._videoEl = el ? /** @type {HTMLVideoElement} */ (el) : null;
    } else if (videoElementOrId instanceof HTMLVideoElement) {
      this._videoEl = videoElementOrId;
    } else {
      this._videoEl = document.getElementById('webcam-video');
    }
    return this;
  }

  /**
   * Load MediaPipe Tasks Vision WASM and initialize HandLandmarker.
   * Attempts WebGL GPU delegate first; falls back automatically to CPU on failure.
   *
   * @param {Object} [overrides={}]
   * @returns {Promise<HandLandmarker>}
   */
  async initialize(overrides = {}) {
    if (this._isInitializing) {
      return this._initPromise;
    }
    if (this._detector) {
      return this._detector;
    }

    this._isInitializing = true;
    const wasmPath = overrides.wasmPath || this._wasmPath;
    const modelAssetPath = overrides.modelAssetPath || this._modelAssetPath;
    const numHands = overrides.numHands || this._numHands;
    const runningMode = overrides.runningMode || this._runningMode;
    const wasmTimeout = AppConfig.tracking.wasmTimeoutMs || 12000;
    const gpuTimeout = AppConfig.tracking.gpuInitTimeoutMs || 8000;
    const cpuTimeout = AppConfig.tracking.cpuInitTimeoutMs || 12000;

    this._initPromise = (async () => {
      try {
        eventBus.emit(Events.NOTIFICATION, {
          message: 'Loading MediaPipe Tasks Vision WASM...',
          type: 'info'
        });

        // 1. Resolve WASM assets with timeout guard
        const vision = await withTimeout(
          FilesetResolver.forVisionTasks(wasmPath),
          wasmTimeout,
          `MediaPipe WASM loading timed out (${wasmTimeout}ms)`
        );

        // --- ATTEMPT 1: GPU Delegate with Timeout Guard ---
        eventBus.emit(Events.NOTIFICATION, {
          message: 'Initializing HandLandmarker (attempting GPU delegate)...',
          type: 'info'
        });

        try {
          this._detector = await withTimeout(
            HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: modelAssetPath,
                delegate: 'GPU'
              },
              runningMode: runningMode,
              numHands: numHands
            }),
            gpuTimeout,
            `GPU delegate initialization timed out (${gpuTimeout}ms)`
          );
          this._delegate = 'GPU';
          stateManager.setCameraState(stateManager.state.camera.isActive, 'GPU');
        } catch (gpuErr) {
          console.warn('[HandTracker] GPU delegate failed or timed out, attempting CPU delegate fallback:', gpuErr.message || gpuErr);

          // Clean up any partial allocations
          if (this._detector && typeof this._detector.close === 'function') {
            try { this._detector.close(); } catch (e) {}
            this._detector = null;
          }

          eventBus.emit(Events.NOTIFICATION, {
            message: 'GPU unavailable. Falling back to CPU delegate...',
            type: 'warning'
          });

          // --- ATTEMPT 2: CPU Delegate Fallback with Timeout Guard ---
          try {
            this._detector = await withTimeout(
              HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                  modelAssetPath: modelAssetPath,
                  delegate: 'CPU'
                },
                runningMode: runningMode,
                numHands: numHands
              }),
              cpuTimeout,
              `CPU delegate initialization timed out (${cpuTimeout}ms)`
            );
            this._delegate = 'CPU';
            stateManager.setCameraState(stateManager.state.camera.isActive, 'CPU');
          } catch (cpuErr) {
            console.error('[HandTracker] Both GPU and CPU delegates failed:', cpuErr.message || cpuErr);
            this._delegate = 'NONE';
            this._detector = null;
            this._isReady = false;

            eventBus.emit(Events.TRACKER_ERROR, {
              error: cpuErr,
              message: 'Failed to initialize HandLandmarker on both GPU and CPU delegates.'
            });

            throw new Error(`[HandTracker] MediaPipe initialization failed: ${cpuErr.message || cpuErr}`);
          }
        }

        this._isReady = true;

        eventBus.emit(Events.TRACKER_INITIALIZED, {
          delegate: this._delegate,
          numHands: numHands,
          runningMode: runningMode
        });

        return this._detector;
      } finally {
        this._isInitializing = false;
      }
    })();

    return this._initPromise;
  }

  /**
   * Run landmark detection on the active video frame.
   * Throttles inference to new video frames (videoEl.currentTime !== lastVideoTime)
   * to avoid redundant computation and maintain 60 FPS performance.
   *
   * @param {number} timestamp - Current high-resolution timestamp (ms)
   * @param {boolean} [force=false] - Bypass timestamp throttle if required
   * @returns {Object|null} MediaPipe detection result with landmarks, or null if frame has not advanced
   */
  detect(timestamp, force = false) {
    if (!this._detector || !this._videoEl || this._videoEl.readyState < 2) {
      return null;
    }

    // Skip redundant inference if the video frame timestamp has not advanced
    if (!force && this._videoEl.currentTime === this._lastVideoTime) {
      return null;
    }
    this._lastVideoTime = this._videoEl.currentTime;

    try {
      const results = this._detector.detectForVideo(this._videoEl, timestamp);
      this._lastResults = results || { landmarks: [], worldLandmarks: [], handedness: [] };
      this._lastLandmarks = this._lastResults.landmarks || [];
      return this._lastResults;
    } catch (err) {
      console.warn('[HandTracker] Detection inference error:', err);
      return { landmarks: [], worldLandmarks: [], handedness: [] };
    }
  }

  /**
   * Return the latest detected hand landmarks collection
   * @returns {Array<Array<{x: number, y: number, z: number}>>}
   */
  getLandmarks() {
    return this._lastLandmarks;
  }

  /**
   * Return the latest complete MediaPipe detection result object
   * @returns {Object|null}
   */
  getResults() {
    return this._lastResults;
  }

  /**
   * Return current detector status, delegate, and telemetry
   * @returns {Object}
   */
  getStatus() {
    return {
      isReady: this._isReady,
      isInitializing: this._isInitializing,
      delegate: this._delegate,
      numHands: this._numHands,
      runningMode: this._runningMode,
      hasVideoElement: Boolean(this._videoEl),
      videoReadyState: this._videoEl ? this._videoEl.readyState : 0,
      detectedHandsCount: this._lastLandmarks.length,
      lastVideoTime: this._lastVideoTime
    };
  }

  /**
   * Check whether the detector is initialized and ready for inference
   * @returns {boolean}
   */
  isReady() {
    return this._isReady && Boolean(this._detector);
  }

  /**
   * Safely close detector instance and release all allocated resources
   */
  dispose() {
    if (this._detector && typeof this._detector.close === 'function') {
      try {
        this._detector.close();
      } catch (err) {
        console.warn('[HandTracker] Error closing HandLandmarker instance:', err);
      }
    }

    this._detector = null;
    this._isReady = false;
    this._isInitializing = false;
    this._initPromise = null;
    this._delegate = 'NONE';
    this._lastResults = null;
    this._lastLandmarks = [];
    this._lastVideoTime = -1;
  }
}

/**
 * Singleton instance of HandTracker
 */
export const handTracker = new HandTracker();
