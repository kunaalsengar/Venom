/**
 * PROJECT NEXUS — CameraManager
 * Dedicated, reusable webcam acquisition, permission handling, stream lifecycle,
 * and status management module.
 *
 * @module camera/CameraManager
 */

import { AppConfig } from '../config/AppConfig.js';
import { Events, eventBus } from '../core/EventBus.js';
import { stateManager } from '../core/StateManager.js';

export class CameraManager {
  /**
   * @param {Object} [options={}]
   * @param {string} [options.facingMode]
   * @param {number} [options.width]
   * @param {number} [options.height]
   * @param {number} [options.frameRate]
   */
  constructor(options = {}) {
    /** @type {HTMLVideoElement|null} */
    this._videoEl = null;

    /** @type {MediaStream|null} */
    this._stream = null;

    this._facingMode = options.facingMode || AppConfig.camera?.facingMode || 'user';
    this._idealWidth = options.width || AppConfig.camera?.idealWidth || AppConfig.tracking.videoIdealWidth || 1280;
    this._idealHeight = options.height || AppConfig.camera?.idealHeight || AppConfig.tracking.videoIdealHeight || 720;
    this._idealFrameRate = options.frameRate || AppConfig.camera?.idealFrameRate || 60;
    this._acquisitionTimeoutMs = options.acquisitionTimeoutMs || AppConfig.camera?.acquisitionTimeoutMs || 10000;

    this._isStarting = false;
    this._hasInFlightHardwareRequest = false;
    this._currentSessionId = 0;
    this._deviceChangeHandler = null;
    this._trackEndedHandler = null;
  }

  /**
   * Initialize manager with video element reference or CSS selector
   * @param {HTMLVideoElement|string} [videoElementOrId='#webcam-video']
   * @returns {HTMLVideoElement}
   */
  init(videoElementOrId = '#webcam-video') {
    if (typeof videoElementOrId === 'string') {
      const el = document.querySelector(videoElementOrId);
      if (!el) {
        throw new Error(`[CameraManager] Video element not found for selector "${videoElementOrId}"`);
      }
      this._videoEl = /** @type {HTMLVideoElement} */ (el);
    } else if (videoElementOrId instanceof HTMLVideoElement) {
      this._videoEl = videoElementOrId;
    } else {
      this._videoEl = document.getElementById('webcam-video');
    }

    // Ensure critical inline video playback properties
    this._videoEl.playsInline = true;
    this._videoEl.muted = true;
    this._videoEl.autoplay = true;

    // Listen for system device changes (plug/unplug webcam)
    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      this._deviceChangeHandler = () => this._handleDeviceChange();
      navigator.mediaDevices.addEventListener('devicechange', this._deviceChangeHandler);
    }

    return this._videoEl;
  }

  /**
   * Check or query camera permission state
   * @returns {Promise<boolean>}
   */
  async requestPermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error('navigator.mediaDevices.getUserMedia is not supported on this browser');
      err.name = 'NotSupportedError';
      throw err;
    }

    if (navigator.permissions && navigator.permissions.query) {
      try {
        const status = await navigator.permissions.query({ name: 'camera' });
        if (status.state === 'granted') {
          stateManager.state.camera.permissionGranted = true;
          return true;
        } else if (status.state === 'denied') {
          stateManager.state.camera.permissionGranted = false;
          return false;
        }
      } catch (e) {
        // Permissions query for 'camera' not supported across all browsers; continue to getUserMedia
      }
    }
    return true;
  }

  /**
   * Acquire webcam stream with cascading fallbacks and bind to video element
   * @param {MediaStreamConstraints} [constraintsOverride]
   * @returns {Promise<MediaStream>}
   */
  async start(constraintsOverride = null) {
    // If stream is already active and attached, return immediately
    if (this._stream && this._stream.active && this._videoEl && this._videoEl.srcObject === this._stream) {
      return this._stream;
    }

    // Do not start a second getUserMedia request while a timed-out request is still pending
    if (this._hasInFlightHardwareRequest) {
      const busyErr = new Error('[CameraManager] A camera request is still pending at the hardware level; cannot start overlapping request.');
      busyErr.name = 'TrackStartError';
      this._handleError(busyErr);
      throw busyErr;
    }

    // Guard against re-entrant calls while async initialization is in-flight
    if (this._isStarting) {
      return new Promise((resolve, reject) => {
        const check = setInterval(() => {
          if (!this._isStarting) {
            clearInterval(check);
            if (this._stream && this._stream.active) resolve(this._stream);
            else reject(new Error('[CameraManager] Concurrent stream startup failed'));
          }
        }, 50);
      });
    }

    this._isStarting = true;
    const sessionId = ++this._currentSessionId;

    if (!this._videoEl) {
      this.init();
    }

    const preferredConstraints = constraintsOverride || {
      video: {
        facingMode: this._facingMode,
        width: { ideal: this._idealWidth },
        height: { ideal: this._idealHeight },
        frameRate: { ideal: this._idealFrameRate }
      },
      audio: false
    };

    let stream = null;

    try {
      stream = await this._requestMediaStream(preferredConstraints, sessionId);
    } catch (err) {
      // If the request timed out or session was invalidated, do not attempt fallback constraints
      // (overlapping requests while hardware request is pending are strictly forbidden)
      if (err.name === 'TimeoutError' || this._currentSessionId !== sessionId) {
        this._isStarting = false;
        this._handleError(err);
        throw err;
      }

      console.warn('[CameraManager] Preferred constraints failed, attempting fallback constraints:', err);
      try {
        // Fallback 1: user-facing without strict resolution bounds
        const fallbackConstraints = {
          video: { facingMode: this._facingMode },
          audio: false
        };
        stream = await this._requestMediaStream(fallbackConstraints, sessionId);
      } catch (fallbackErr) {
        if (fallbackErr.name === 'TimeoutError' || this._currentSessionId !== sessionId) {
          this._isStarting = false;
          this._handleError(fallbackErr);
          throw fallbackErr;
        }

        console.warn('[CameraManager] Secondary fallback failed, attempting generic video:', fallbackErr);
        // Fallback 2: generic video capture
        try {
          stream = await this._requestMediaStream({ video: true, audio: false }, sessionId);
        } catch (finalErr) {
          this._isStarting = false;
          this._handleError(finalErr);
          throw finalErr;
        }
      }
    }

    // Guard against session change or stop() called while stream was being acquired
    if (this._currentSessionId !== sessionId) {
      if (stream) {
        this._stopStreamTracks(stream);
      }
      this._isStarting = false;
      const abortErr = new Error('[CameraManager] Camera startup aborted due to state/session change');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    this._stream = stream;
    this._videoEl.srcObject = stream;

    // Listen for unexpected track disconnection or privacy shutter shut
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length > 0) {
      const activeTrack = videoTracks[0];
      this._trackEndedHandler = () => {
        console.warn('[CameraManager] Video track ended unexpectedly.');
        this._handleTrackEnded();
      };
      activeTrack.addEventListener('ended', this._trackEndedHandler);
    }

    // Play video stream
    try {
      await this._videoEl.play();
    } catch (playErr) {
      console.warn('[CameraManager] videoEl.play() warning:', playErr);
    }

    // Await readyState >= 2 (HAVE_CURRENT_DATA) for reliable MediaPipe landmark inference
    await new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      const timeoutTimer = setTimeout(done, 1500);

      if (this._videoEl.readyState >= 2) {
        clearTimeout(timeoutTimer);
        done();
      } else {
        this._videoEl.onloadeddata = () => {
          clearTimeout(timeoutTimer);
          done();
        };
      }
    });

    // Check again if session changed during video play / readyState wait
    if (this._currentSessionId !== sessionId) {
      this.stop();
      this._isStarting = false;
      const abortErr = new Error('[CameraManager] Camera startup aborted during playback ready check');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    this._isStarting = false;

    // Retrieve active stream track properties
    const videoTrack = stream.getVideoTracks()[0];
    const settings = videoTrack && videoTrack.getSettings ? videoTrack.getSettings() : {};
    const actualWidth = settings.width || this._videoEl.videoWidth || this._idealWidth;
    const actualHeight = settings.height || this._videoEl.videoHeight || this._idealHeight;

    // Synchronize StateManager camera domain
    stateManager.setCameraState(true, stateManager.state.camera.delegate || 'GPU', true, {
      permissionGranted: true,
      facingMode: this._facingMode,
      width: actualWidth,
      height: actualHeight
    });

    eventBus.emit(Events.NOTIFICATION, {
      message: 'Tracking active: Face camera & position hand',
      type: 'info'
    });

    return stream;
  }

  /**
   * Safely stop all active media tracks and detach from video element
   */
  stop() {
    this._currentSessionId++;
    this._isStarting = false;

    if (this._stream) {
      const tracks = this._stream.getTracks();
      tracks.forEach((track) => {
        if (this._trackEndedHandler) {
          track.removeEventListener('ended', this._trackEndedHandler);
        }
        track.stop();
      });
      this._stream = null;
    }

    if (this._videoEl) {
      this._videoEl.srcObject = null;
    }

    stateManager.setCameraState(false, stateManager.state.camera.delegate, false);
  }

    stateManager.setCameraState(false, stateManager.state.camera.delegate, false);
  }

  /**
   * Switch camera facing mode between 'user' and 'environment'
   * @returns {Promise<MediaStream>}
   */
  async switchCamera() {
    const nextMode = this._facingMode === 'user' ? 'environment' : 'user';
    this.stop();
    this._facingMode = nextMode;
    return this.start();
  }

  /**
   * Return the active MediaStream or null
   * @returns {MediaStream|null}
   */
  getStream() {
    return this._stream;
  }

  /**
   * Expose the video DOM element
   * @returns {HTMLVideoElement|null}
   */
  getVideoElement() {
    return this._videoEl;
  }

  /**
   * Return current camera operational telemetry and status
   * @returns {Object}
   */
  getStatus() {
    const track = this._stream ? this._stream.getVideoTracks()[0] : null;
    return {
      isActive: Boolean(this._stream && this._stream.active),
      hasStream: Boolean(this._stream),
      permissionGranted: stateManager.state.camera.permissionGranted,
      facingMode: this._facingMode,
      width: this._videoEl ? this._videoEl.videoWidth : 0,
      height: this._videoEl ? this._videoEl.videoHeight : 0,
      readyState: this._videoEl ? this._videoEl.readyState : 0,
      trackLabel: track ? track.label : 'None',
      trackMuted: track ? track.muted : false
    };
  }

  /**
   * Handle unexpected track termination
   * @private
   */
  _handleTrackEnded() {
    this.stop();
    stateManager.notify('Camera feed interrupted or disconnected.', 'warning');
    eventBus.emit(Events.TRACKING_MODE_CHANGE, {
      isMouseFallback: true,
      reason: 'Camera device was disconnected or interrupted.'
    });
  }

  /**
   * Handle device change event (e.g. webcam plugged/unplugged)
   * @private
   */
  _handleDeviceChange() {
    if (this._stream && !this._stream.active) {
      this._handleTrackEnded();
    }
  }

  /**
   * Request media stream with acquisition timeout and late-resolution protection
   * @private
   * @param {MediaStreamConstraints} constraints
   * @param {number} sessionId
   * @returns {Promise<MediaStream>}
   */
  _requestMediaStream(constraints, sessionId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error('navigator.mediaDevices.getUserMedia is not supported on this browser');
      err.name = 'NotSupportedError';
      return Promise.reject(err);
    }

    this._hasInFlightHardwareRequest = true;

    return new Promise((resolve, reject) => {
      let timerId = null;
      let timedOut = false;
      let settled = false;

      timerId = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        settled = true;
        timerId = null;

        const timeoutErr = new Error(`Camera acquisition timed out after ${this._acquisitionTimeoutMs}ms`);
        timeoutErr.name = 'TimeoutError';
        reject(timeoutErr);
      }, this._acquisitionTimeoutMs);

      navigator.mediaDevices.getUserMedia(constraints)
        .then((stream) => {
          this._hasInFlightHardwareRequest = false;

          if (timerId) {
            clearTimeout(timerId);
            timerId = null;
          }

          // Check if request timed out or session became stale/invalidated
          if (timedOut || this._currentSessionId !== sessionId) {
            console.warn('[CameraManager] Discarding late-resolving camera stream from timed-out or obsolete session.');
            this._stopStreamTracks(stream);
            if (!settled) {
              settled = true;
              const abortErr = new Error('[CameraManager] Stream discarded due to obsolete session.');
              abortErr.name = 'AbortError';
              reject(abortErr);
            }
            return;
          }

          settled = true;
          resolve(stream);
        })
        .catch((err) => {
          this._hasInFlightHardwareRequest = false;

          if (timerId) {
            clearTimeout(timerId);
            timerId = null;
          }

          if (timedOut || this._currentSessionId !== sessionId) {
            // Late rejection after timeout or session cancellation.
            // Safely swallowed to prevent unhandled promise rejection.
            console.warn('[CameraManager] Late getUserMedia rejection safely swallowed:', err.name || err.message);
            return;
          }

          settled = true;
          reject(err);
        });
    });
  }

  /**
   * Helper to stop all tracks of a MediaStream safely
   * @private
   * @param {MediaStream} stream
   */
  _stopStreamTracks(stream) {
    if (!stream) return;
    try {
      const tracks = stream.getTracks ? stream.getTracks() : [];
      tracks.forEach((track) => {
        try {
          track.stop();
        } catch (_) {}
      });
    } catch (_) {}
  }

  /**
   * Translate and emit standardized camera errors
   * @private
   * @param {Error} err
   */
  _handleError(err) {
    let friendlyMessage = 'Camera initialization failed.';

    switch (err.name) {
      case 'TimeoutError':
        friendlyMessage = `Camera acquisition timed out (${Math.round(this._acquisitionTimeoutMs / 1000)}s). Mouse fallback active.`;
        break;
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        friendlyMessage = 'Camera access denied by user. Mouse fallback active.';
        stateManager.state.camera.permissionGranted = false;
        break;
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        friendlyMessage = 'No webcam hardware detected on system. Mouse fallback active.';
        break;
      case 'NotReadableError':
      case 'TrackStartError':
        friendlyMessage = 'Camera is already in use by another application. Mouse fallback active.';
        break;
      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        friendlyMessage = 'Camera does not satisfy requested resolution constraints.';
        break;
      default:
        friendlyMessage = `Camera notice: ${err.message || err.name || 'Unavailable'}. Mouse fallback active.`;
        break;
    }

    stateManager.setCameraState(false, stateManager.state.camera.delegate, false);
    stateManager.notify(friendlyMessage, 'warning');
  }

  /**
   * Teardown stream, remove listeners, and clean up resources
   */
  dispose() {
    this.stop();

    if (this._deviceChangeHandler && navigator.mediaDevices && typeof navigator.mediaDevices.removeEventListener === 'function') {
      navigator.mediaDevices.removeEventListener('devicechange', this._deviceChangeHandler);
      this._deviceChangeHandler = null;
    }

    this._videoEl = null;
  }
}

/**
 * Singleton instance of CameraManager
 */
export const cameraManager = new CameraManager();
