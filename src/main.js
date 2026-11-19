// BLACK MATTER — Phase 3, Step 4: Photo Stage, Living Liquid Field & Dynamic Tendril Physics
// Preserves Step 1-3 architecture (asset loading, grayscale-to-alpha mask conversion,
// unified photoRect coordinate system, full-mask debug mode, living liquid field & branching veins)
// and integrates the Step 4 dynamic spring-chain tendril system (spawning, tension, snapping & recoil).

import { createRevealCompositor } from './revealCompositor.js';
import { createLiquidField } from './liquidField.js';
import { createTendrilSystem } from './tendrils.js';

const CONFIG = Object.freeze({
  assets: Object.freeze({
    original: 'public/images/my-photo.png',
    symbiote: 'public/images/my-photo-symbiote.png',
    mask: 'public/images/my-photo-mask.png'
  }),
  expectedWidth: 907,
  expectedHeight: 1147,
  // Low-res scalar liquid field (~1/5 of 907x1147) matching portrait aspect ratio
  fieldWidth: 182,
  fieldHeight: 230,
  frameRadius: 12,
  // Cap DPR at 2 for crisp Retina rendering without 3x fill-rate overhead
  maxDpr: 2,
  maxStageHeight: 920,
  // Pointer proximity margin around photoRect (UV units)
  pointerMarginRatio: 0.14
});

const ASSET_ASPECT = CONFIG.expectedWidth / CONFIG.expectedHeight;

// ---- Math & Path Helpers ----
const clamp = (v, min, max) => (min > max ? min : Math.max(min, Math.min(max, v)));

function roundedRectPath(targetCtx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  targetCtx.beginPath();
  targetCtx.moveTo(x + radius, y);
  targetCtx.arcTo(x + w, y, x + w, y + h, radius);
  targetCtx.arcTo(x + w, y + h, x, y + h, radius);
  targetCtx.arcTo(x, y + h, x, y, radius);
  targetCtx.arcTo(x, y, x + w, y, radius);
  targetCtx.closePath();
}

// ---- DOM References ----
const canvas = document.getElementById('c');
const ctx = canvas ? canvas.getContext('2d') : null;
const hintEl = document.getElementById('hint');
const fallbackEl = document.getElementById('fallback');
const fallbackImgEl = document.getElementById('fallback-img');
const fallbackMsgEl = document.getElementById('fallback-msg');

// ---- Reduced Motion Support (preserved live listener) ----
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = motionQuery.matches;

// ---- Viewport & Unified Coordinate State ----
const viewport = { width: 1, height: 1, dpr: 1 };

// Single source of truth for all image layers (original, symbiote, mask, reveal buffer)
const photoRect = { x: 0, y: 0, w: 0, h: 0, scale: 1 };

// Pointer state in viewport & normalized UV space [0..1] with smoothed UV velocity
const pointer = {
  clientX: 0,
  clientY: 0,
  u: 0.5,
  v: 0.5,
  prevU: 0.5,
  prevV: 0.5,
  du: 0,
  dv: 0,
  insidePhoto: false,
  nearPhoto: false,
  active: false,
  isTouch: false,
  interacted: false,
  // Phase A: Continuous Directional Zone Weights [0..1]
  weightLeft: 0,
  weightCenter: 0,
  weightRight: 0
};

// Mode state (normal resting load is 'off' -> pure untouched original portrait)
const initialDebugParam = new URLSearchParams(window.location.search).get('debug');
const appState = {
  debugMode: initialDebugParam === 'full-mask' ? 'full-mask' : 'off'
};

// Loaded & prepared visual assets (allocated once after image load)
const assets = {
  ready: false,
  error: null,
  original: null,
  symbiote: null,
  maskSource: null,
  // Genuine alpha-channel mask canvas (907x1147) derived from opaque grayscale PNG luminance
  alphaMaskCanvas: null,
  // Pre-allocated normalized foreground mask grid (182x230, values 0.0..1.0)
  maskGrid: new Float32Array(CONFIG.fieldWidth * CONFIG.fieldHeight),
  maskStats: null
};

// Reusable offscreen compositors, living liquid field & dynamic tendril system
const revealCompositor = createRevealCompositor();
let liquidField = null;
let tendrilSystem = null;

const shadowCache = {
  canvas: document.createElement('canvas'),
  ctx: null,
  pad: 72
};
shadowCache.ctx = shadowCache.canvas.getContext('2d');

// ---- Directional Zone Weight Calculation (Phase A) ----
// Computes C1-continuous Hermite weights for Left, Center, and Right interaction zones.
// Guaranteed properties:
// 1. All weights in [0, 1], zero negative values.
// 2. Partition of unity: left + center + right = 1.0 for all u.
// 3. Center reaches exact global maximum of 1.0000 at u = 0.50.
// 4. Smooth transitions: dW/du = 0 at all boundaries (0.32, 0.50, 0.68).
export function computeZoneWeights(u) {
  const cu = clamp(u, 0, 1);
  let left = 0;
  let right = 0;

  if (cu <= 0.32) {
    left = 1;
  } else if (cu < 0.50) {
    const t = (0.50 - cu) / 0.18;
    left = t * t * (3 - 2 * t);
  }

  if (cu >= 0.68) {
    right = 1;
  } else if (cu > 0.50) {
    const t = (cu - 0.50) / 0.18;
    right = t * t * (3 - 2 * t);
  }

  const center = Math.max(0, Math.min(1, 1 - left - right));
  return { left, center, right };
}

// Phase A: Pre-allocated Anatomical Anchors for Directional Full-Body Transformation
// 11 anchors: 4 Left, 3 Center, 4 Right. Validated against actual maskGrid (mask = 1.000).
export const ANATOMICAL_ANCHORS = Object.freeze([
  // 4 Left anchors (viewer's left / subject's right flank)
  Object.freeze({ id: 'left_shoulder', zone: 'left', name: 'Left Shoulder', u: 0.3049, v: 0.4587, gx: 55, gy: 105 }),
  Object.freeze({ id: 'left_upper_torso', zone: 'left', name: 'Left Upper Torso', u: 0.3214, v: 0.6109, gx: 58, gy: 140 }),
  Object.freeze({ id: 'left_forearm', zone: 'left', name: 'Left Forearm/Wrist', u: 0.2665, v: 0.7630, gx: 48, gy: 175 }),
  Object.freeze({ id: 'left_lower_waist', zone: 'left', name: 'Left Lower Waist', u: 0.2555, v: 0.8935, gx: 46, gy: 205 }),

  // 3 Center anchors (sternum, crossed arms, abdomen)
  Object.freeze({ id: 'center_sternum', zone: 'center', name: 'Center Sternum/Plexus', u: 0.5027, v: 0.5457, gx: 91, gy: 125 }),
  Object.freeze({ id: 'center_crossed_arms', zone: 'center', name: 'Center Crossed Arms', u: 0.5027, v: 0.7196, gx: 91, gy: 165 }),
  Object.freeze({ id: 'center_mid_waist', zone: 'center', name: 'Center Mid-Waist', u: 0.5027, v: 0.8500, gx: 91, gy: 195 }),

  // 4 Right anchors (viewer's right / subject's left flank)
  Object.freeze({ id: 'right_shoulder', zone: 'right', name: 'Right Shoulder', u: 0.6896, v: 0.4587, gx: 125, gy: 105 }),
  Object.freeze({ id: 'right_bicep', zone: 'right', name: 'Right Bicep', u: 0.7445, v: 0.6326, gx: 135, gy: 145 }),
  Object.freeze({ id: 'right_forearm', zone: 'right', name: 'Right Forearm', u: 0.7170, v: 0.7630, gx: 130, gy: 175 }),
  Object.freeze({ id: 'right_hip', zone: 'right', name: 'Right Hip/Waist', u: 0.6896, v: 0.8935, gx: 125, gy: 205 })
]);

export function validateAnatomicalAnchors(anchors, maskGrid, width, height) {
  const validated = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const gx = Math.min(width - 1, Math.max(0, Math.round(a.u * (width - 1))));
    const gy = Math.min(height - 1, Math.max(0, Math.round(a.v * (height - 1))));
    const idx = gy * width + gx;
    const maskVal = maskGrid ? maskGrid[idx] : 0;
    const valid = maskVal >= 0.50;
    validated.push(Object.freeze({
      id: a.id,
      zone: a.zone,
      name: a.name,
      u: a.u,
      v: a.v,
      gx,
      gy,
      maskVal: Number(maskVal.toFixed(4)),
      valid
    }));
  }
  return Object.freeze(validated);
}

// ---- Coordinate Mapping Helpers (Single Source of Truth: photoRect) ----
export function clientToUV(clientX, clientY) {
  if (photoRect.w <= 0 || photoRect.h <= 0) {
    return {
      u: 0,
      v: 0,
      insidePhoto: false,
      nearPhoto: false,
      weightLeft: 0,
      weightCenter: 0,
      weightRight: 0
    };
  }
  const u = (clientX - photoRect.x) / photoRect.w;
  const v = (clientY - photoRect.y) / photoRect.h;
  const insidePhoto = u >= 0 && u <= 1 && v >= 0 && v <= 1;

  const padU = CONFIG.pointerMarginRatio;
  const padV = CONFIG.pointerMarginRatio * ASSET_ASPECT;
  const nearPhoto = u >= -padU && u <= 1 + padU && v >= -padV && v <= 1 + padV;

  const { left, center, right } = computeZoneWeights(u);

  return {
    u,
    v,
    insidePhoto,
    nearPhoto,
    weightLeft: left,
    weightCenter: center,
    weightRight: right
  };
}

export function uvToCanvas(u, v) {
  return {
    x: photoRect.x + u * photoRect.w,
    y: photoRect.y + v * photoRect.h
  };
}

export function uvToAssetPixel(u, v) {
  return {
    x: clamp(u, 0, 1) * CONFIG.expectedWidth,
    y: clamp(v, 0, 1) * CONFIG.expectedHeight
  };
}

export function uvToFieldCell(u, v) {
  const gx = clamp(Math.floor(u * CONFIG.fieldWidth), 0, CONFIG.fieldWidth - 1);
  const gy = clamp(Math.floor(v * CONFIG.fieldHeight), 0, CONFIG.fieldHeight - 1);
  return { gx, gy, index: gy * CONFIG.fieldWidth + gx };
}

export function fieldCellToCanvas(gx, gy) {
  return {
    x: photoRect.x + ((gx + 0.5) / CONFIG.fieldWidth) * photoRect.w,
    y: photoRect.y + ((gy + 0.5) / CONFIG.fieldHeight) * photoRect.h
  };
}

export function sampleMaskAtUV(u, v) {
  if (!assets.ready || u < 0 || u > 1 || v < 0 || v > 1) return 0;
  const { index } = uvToFieldCell(u, v);
  return assets.maskGrid[index];
}

// ---- Asset Loading & Grayscale Mask-to-Alpha Conversion (preserved from Step 1) ----
function loadImage(src, label) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (img.naturalWidth !== CONFIG.expectedWidth || img.naturalHeight !== CONFIG.expectedHeight) {
        reject(new Error(
          `${label} dimensions mismatch: got ${img.naturalWidth}x${img.naturalHeight}, expected ${CONFIG.expectedWidth}x${CONFIG.expectedHeight}`
        ));
        return;
      }
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load ${label} from ${src}`));
    img.src = src;
  });
}

function buildAlphaMaskAndGrid(maskImg) {
  const W = CONFIG.expectedWidth;
  const H = CONFIG.expectedHeight;

  const readCanvas = document.createElement('canvas');
  readCanvas.width = W;
  readCanvas.height = H;
  const readCtx = readCanvas.getContext('2d', { willReadFrequently: true });
  readCtx.drawImage(maskImg, 0, 0, W, H);
  const srcPixels = readCtx.getImageData(0, 0, W, H).data;

  // 1. Convert opaque grayscale luminance (red channel) -> genuine alpha-channel mask (907x1147)
  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = W;
  alphaCanvas.height = H;
  const alphaCtx = alphaCanvas.getContext('2d');
  const alphaImgData = alphaCtx.createImageData(W, H);
  const dstPixels = alphaImgData.data;

  let transparentCount = 0;
  let opaqueCount = 0;
  let antialiasedCount = 0;

  for (let i = 0; i < srcPixels.length; i += 4) {
    const lum = srcPixels[i];
    dstPixels[i] = 255;
    dstPixels[i + 1] = 255;
    dstPixels[i + 2] = 255;
    dstPixels[i + 3] = lum;

    if (lum === 0) transparentCount++;
    else if (lum === 255) opaqueCount++;
    else antialiasedCount++;
  }
  alphaCtx.putImageData(alphaImgData, 0, 0);

  // 2. Populate pre-allocated normalized 182x230 lookup grid via box averaging
  const fw = CONFIG.fieldWidth;
  const fh = CONFIG.fieldHeight;
  const grid = assets.maskGrid;

  for (let gy = 0; gy < fh; gy++) {
    const y0 = Math.floor((gy * H) / fh);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * H) / fh));
    for (let gx = 0; gx < fw; gx++) {
      const x0 = Math.floor((gx * W) / fw);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * W) / fw));

      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        const rowOffset = y * W;
        for (let x = x0; x < x1; x++) {
          sum += srcPixels[(rowOffset + x) * 4];
          count++;
        }
      }
      grid[gy * fw + gx] = count > 0 ? (sum / (count * 255)) : 0;
    }
  }

  return {
    alphaCanvas,
    stats: {
      width: W,
      height: H,
      transparentCount,
      opaqueCount,
      antialiasedCount,
      subjectCoverage: Number(((opaqueCount + antialiasedCount * 0.5) / (W * H)).toFixed(4)),
      gridWidth: fw,
      gridHeight: fh
    }
  };
}

// ---- Stage Layout & Cached Ambient Gallery Shadow ----
function computePhotoRect() {
  const padX = clamp(viewport.width * 0.06, 28, 72);
  const padTop = clamp(viewport.height * 0.055, 28, 54);
  const padBottom = clamp(viewport.height * 0.075, 48, 72);

  const availW = Math.max(120, viewport.width - padX * 2);
  const availH = Math.max(160, Math.min(viewport.height - padTop - padBottom, CONFIG.maxStageHeight));

  const scale = Math.min(availW / CONFIG.expectedWidth, availH / CONFIG.expectedHeight);
  const w = Math.round(CONFIG.expectedWidth * scale);
  const h = Math.round(CONFIG.expectedHeight * scale);
  const x = Math.round((viewport.width - w) / 2);
  const y = Math.round((viewport.height - h) / 2);

  photoRect.x = x;
  photoRect.y = y;
  photoRect.w = w;
  photoRect.h = h;
  photoRect.scale = scale;
}

function rebuildShadowCache() {
  if (!shadowCache.ctx || photoRect.w <= 0 || photoRect.h <= 0) return;

  const pad = 76;
  shadowCache.pad = pad;
  const cw = photoRect.w + pad * 2;
  const ch = photoRect.h + pad * 2;

  shadowCache.canvas.width = Math.round(cw * viewport.dpr);
  shadowCache.canvas.height = Math.round(ch * viewport.dpr);

  const sctx = shadowCache.ctx;
  sctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  sctx.clearRect(0, 0, cw, ch);

  sctx.save();
  sctx.shadowColor = 'rgba(34, 30, 42, 0.22)';
  sctx.shadowBlur = 44 * viewport.dpr;
  sctx.shadowOffsetX = 0;
  sctx.shadowOffsetY = 22 * viewport.dpr;
  sctx.fillStyle = '#1b1a1e';
  roundedRectPath(sctx, pad, pad, photoRect.w, photoRect.h, CONFIG.frameRadius);
  sctx.fill();
  sctx.restore();

  sctx.save();
  sctx.shadowColor = 'rgba(24, 22, 30, 0.14)';
  sctx.shadowBlur = 14 * viewport.dpr;
  sctx.shadowOffsetX = 0;
  sctx.shadowOffsetY = 6 * viewport.dpr;
  sctx.fillStyle = '#1b1a1e';
  roundedRectPath(sctx, pad, pad, photoRect.w, photoRect.h, CONFIG.frameRadius);
  sctx.fill();
  sctx.restore();
}

// ---- Rendering (Base Original Photo + Debug Full-Mask OR Living Liquid Symbiote Reveal) ----
function render() {
  if (!ctx || !assets.ready) return;

  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  // 1. Cached soft ambient gallery shadow
  const pad = shadowCache.pad;
  ctx.drawImage(
    shadowCache.canvas,
    photoRect.x - pad,
    photoRect.y - pad,
    photoRect.w + pad * 2,
    photoRect.h + pad * 2
  );

  // 2. Clipped 12px rounded gallery frame containing base photo + aligned masked symbiote layer
  ctx.save();
  roundedRectPath(ctx, photoRect.x, photoRect.y, photoRect.w, photoRect.h, CONFIG.frameRadius);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Permanent base layer: untouched original human photograph
  ctx.drawImage(assets.original, photoRect.x, photoRect.y, photoRect.w, photoRect.h);

  // Overlay layer: dev full-mask verification OR Step 3 living liquid + Step 4 glossy tendrils
  let revealLayer = null;
  let tendrilLayer = null;
  if (appState.debugMode === 'full-mask') {
    revealLayer = revealCompositor.composeFullMask(assets.symbiote, assets.alphaMaskCanvas);
  } else {
    if (liquidField && liquidField.isActive()) {
      const stats = liquidField.getStats();
      revealLayer = revealCompositor.composeLiquidReveal(
        assets.symbiote,
        assets.alphaMaskCanvas,
        liquidField.getFieldCanvas(),
        liquidField.getVeinCanvas(),
        stats.activeVeins > 0
      );
    }
    if (tendrilSystem && tendrilSystem.isActive()) {
      tendrilLayer = revealCompositor.composeTendrils(tendrilSystem);
    }
  }

  if (revealLayer) {
    ctx.drawImage(revealLayer, photoRect.x, photoRect.y, photoRect.w, photoRect.h);
  }
  if (tendrilLayer) {
    ctx.drawImage(tendrilLayer, photoRect.x, photoRect.y, photoRect.w, photoRect.h);
  }
  ctx.restore();

  // 3. Subtle hairline frame edge
  ctx.save();
  roundedRectPath(ctx, photoRect.x + 0.5, photoRect.y + 0.5, photoRect.w - 1, photoRect.h - 1, CONFIG.frameRadius);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// ---- Demand-Driven Animation Loop (Sleeps Cleanly Once Self-Healing Completes) ----
let rafId = 0;
let lastFrameTime = 0;

function scheduleLoop() {
  if (rafId || !assets.ready || document.hidden) return;
  lastFrameTime = performance.now() / 1000;
  rafId = window.requestAnimationFrame(stepFrame);
}

function stopLoop() {
  if (rafId) {
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function stepFrame(nowMs) {
  rafId = 0;
  const now = nowMs / 1000;
  const dt = Math.min(Math.max(now - lastFrameTime, 0), 1 / 30);
  lastFrameTime = now;

  if (appState.debugMode === 'full-mask') {
    render();
    return;
  }

  // Smooth UV velocity estimation for cursor-speed-reactive liquid expansion
  const safeDt = Math.max(dt, 0.004);
  const instDu = pointer.active ? (pointer.u - pointer.prevU) / safeDt : 0;
  const instDv = pointer.active ? (pointer.v - pointer.prevV) / safeDt : 0;
  const vLerp = 1 - Math.exp(-12 * dt);
  pointer.du += (instDu - pointer.du) * vLerp;
  pointer.dv += (instDv - pointer.dv) * vLerp;
  pointer.prevU = pointer.u;
  pointer.prevV = pointer.v;

  const liquidAlive = liquidField
    ? liquidField.step(dt, now, pointer, reduceMotion)
    : false;
  const tendrilsAlive = tendrilSystem
    ? tendrilSystem.step(dt, now, pointer, reduceMotion)
    : false;

  render();

  if ((liquidAlive || tendrilsAlive || (tendrilSystem && tendrilSystem.isActive())) && !document.hidden) {
    rafId = window.requestAnimationFrame(stepFrame);
  }
}

function setDebugMode(mode) {
  if (mode !== 'off' && mode !== 'full-mask') {
    throw new Error(`Invalid debug mode "${mode}". Use "off" or "full-mask".`);
  }
  appState.debugMode = mode;
  if (mode === 'full-mask') {
    stopLoop();
    render();
  } else {
    render();
    if (
      (pointer.active && pointer.nearPhoto) ||
      (liquidField && liquidField.isActive()) ||
      (tendrilSystem && tendrilSystem.isActive())
    ) {
      scheduleLoop();
    }
  }
  return appState.debugMode;
}

function resetField() {
  if (liquidField) liquidField.reset();
  if (tendrilSystem) tendrilSystem.reset();
  render();
}

function showFallback(message, showOriginalPhoto) {
  stopLoop();
  if (hintEl) hintEl.classList.add('off');
  if (canvas) canvas.hidden = true;
  if (fallbackEl) fallbackEl.hidden = false;
  if (fallbackImgEl && showOriginalPhoto) {
    fallbackImgEl.src = CONFIG.assets.original;
    fallbackImgEl.hidden = false;
  }
  if (fallbackMsgEl) {
    fallbackMsgEl.textContent = message;
  }
}

// ---- Resize, DPR & Pointer Lifecycle (Single Listener Set via AbortController) ----
const lifecycleController = new AbortController();
let dprMediaQuery = null;

function handleResize() {
  viewport.dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr);
  viewport.width = document.documentElement.clientWidth || window.innerWidth;
  viewport.height = window.innerHeight;

  if (canvas) {
    canvas.width = Math.round(viewport.width * viewport.dpr);
    canvas.height = Math.round(viewport.height * viewport.dpr);
  }

  computePhotoRect();
  rebuildShadowCache();
  revealCompositor.resize(photoRect.w, photoRect.h, viewport.dpr);

  if (pointer.active) {
    const mapped = clientToUV(pointer.clientX, pointer.clientY);
    pointer.u = mapped.u;
    pointer.v = mapped.v;
    pointer.prevU = mapped.u;
    pointer.prevV = mapped.v;
    pointer.insidePhoto = mapped.insidePhoto;
    pointer.nearPhoto = mapped.nearPhoto;
    pointer.weightLeft = mapped.weightLeft;
    pointer.weightCenter = mapped.weightCenter;
    pointer.weightRight = mapped.weightRight;
  }

  render();
}

function watchDprChanges() {
  if (dprMediaQuery) {
    dprMediaQuery.removeEventListener('change', onDprChange);
  }
  dprMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  dprMediaQuery.addEventListener('change', onDprChange, { once: true });
}

function onDprChange() {
  handleResize();
  watchDprChanges();
}

function updatePointer(ev, isDown) {
  if (!ev.isPrimary) return;
  const wasActive = pointer.active;
  pointer.clientX = ev.clientX;
  pointer.clientY = ev.clientY;
  pointer.isTouch = ev.pointerType === 'touch';
  pointer.active = true;

  const mapped = clientToUV(ev.clientX, ev.clientY);
  pointer.u = mapped.u;
  pointer.v = mapped.v;
  pointer.insidePhoto = mapped.insidePhoto;
  pointer.nearPhoto = mapped.nearPhoto;
  pointer.weightLeft = mapped.weightLeft;
  pointer.weightCenter = mapped.weightCenter;
  pointer.weightRight = mapped.weightRight;

  if (!wasActive || isDown) {
    pointer.prevU = mapped.u;
    pointer.prevV = mapped.v;
    pointer.du = 0;
    pointer.dv = 0;
  }

  if (!pointer.interacted && mapped.insidePhoto) {
    pointer.interacted = true;
    if (hintEl) hintEl.classList.add('off');
  }

  if (
    appState.debugMode === 'off' &&
    (mapped.nearPhoto || (liquidField && liquidField.isActive()) || (tendrilSystem && tendrilSystem.isActive()))
  ) {
    scheduleLoop();
  }
}

function clearPointer() {
  pointer.active = false;
  pointer.insidePhoto = false;
  pointer.nearPhoto = false;
  pointer.du = 0;
  pointer.dv = 0;
  pointer.weightLeft = 0;
  pointer.weightCenter = 0;
  pointer.weightRight = 0;
  // Keep loop alive until tendrils recoil cleanly and Living Memory self-heals back to rest
  if (
    appState.debugMode === 'off' &&
    ((liquidField && liquidField.isActive()) || (tendrilSystem && tendrilSystem.isActive()))
  ) {
    scheduleLoop();
  }
}

function bindEvents() {
  const { signal } = lifecycleController;
  window.addEventListener('resize', handleResize, { signal });
  window.addEventListener('orientationchange', handleResize, { signal });
  window.addEventListener('pointermove', (ev) => updatePointer(ev, false), { signal });
  window.addEventListener('pointerdown', (ev) => updatePointer(ev, true), { signal });
  window.addEventListener('pointerup', (ev) => {
    if (ev.isPrimary && ev.pointerType === 'touch') clearPointer();
  }, { signal });
  window.addEventListener('pointercancel', (ev) => {
    if (ev.isPrimary) clearPointer();
  }, { signal });
  document.documentElement.addEventListener('pointerleave', clearPointer, { signal });
  window.addEventListener('blur', clearPointer, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopLoop();
    } else if (
      appState.debugMode === 'off' &&
      (
        (pointer.active && pointer.nearPhoto) ||
        (liquidField && liquidField.isActive()) ||
        (tendrilSystem && tendrilSystem.isActive())
      )
    ) {
      scheduleLoop();
    }
  }, { signal });
  motionQuery.addEventListener('change', (ev) => {
    reduceMotion = ev.matches;
  }, { signal });
  watchDprChanges();
}

// ---- Initialization ----
async function init() {
  if (!canvas || !ctx) {
    showFallback('Canvas 2D is unavailable in this browser.', true);
    return;
  }

  bindEvents();
  handleResize();

  try {
    const [originalImg, symbioteImg, maskImg] = await Promise.all([
      loadImage(CONFIG.assets.original, 'Original portrait'),
      loadImage(CONFIG.assets.symbiote, 'Symbiote portrait'),
      loadImage(CONFIG.assets.mask, 'Foreground mask')
    ]);

    const { alphaCanvas, stats } = buildAlphaMaskAndGrid(maskImg);

    assets.original = originalImg;
    assets.symbiote = symbioteImg;
    assets.maskSource = maskImg;
    assets.alphaMaskCanvas = alphaCanvas;
    assets.maskStats = stats;

    // Initialize living liquid field reusing the already-built 182x230 maskGrid and pre-allocated anchors
    liquidField = createLiquidField({
      width: CONFIG.fieldWidth,
      height: CONFIG.fieldHeight,
      maskGrid: assets.maskGrid,
      anchors: ANATOMICAL_ANCHORS
    });

    // Initialize dynamic spring-chain tendril system anchored to the living liquid field
    tendrilSystem = createTendrilSystem({
      liquidField,
      aspectRatio: ASSET_ASPECT
    });

    assets.ready = true;
    render();
  } catch (err) {
    assets.error = err instanceof Error ? err.message : String(err);
    console.error('[BLACK MATTER] Asset initialization failed:', err);
    showFallback('Unable to load all portrait assets. Showing fallback image.', true);
  }
}

// Read-only inspection & dev debug controls (preserved + extended with zone telemetry)
window.__BLACK_MATTER__ = {
  phase: 'phase3-step4',
  CONFIG,
  clientToUV,
  uvToCanvas,
  uvToAssetPixel,
  uvToFieldCell,
  fieldCellToCanvas,
  sampleMaskAtUV,
  computeZoneWeights,
  ANATOMICAL_ANCHORS,
  validateAnatomicalAnchors,
  setDebugMode,
  getDebugMode: () => appState.debugMode,
  resetField,
  getState() {
    return {
      ready: assets.ready,
      error: assets.error,
      reduceMotion,
      debugMode: appState.debugMode,
      viewport: { ...viewport },
      photoRect: {
        ...photoRect,
        aspectRatio: photoRect.h > 0 ? Number((photoRect.w / photoRect.h).toFixed(5)) : 0,
        expectedAspectRatio: Number(ASSET_ASPECT.toFixed(5)),
        centerOffsetX: Number(((photoRect.x + photoRect.w / 2) - viewport.width / 2).toFixed(2)),
        centerOffsetY: Number(((photoRect.y + photoRect.h / 2) - viewport.height / 2).toFixed(2))
      },
      assetsLoaded: {
        original: assets.original ? `${assets.original.naturalWidth}x${assets.original.naturalHeight}` : null,
        symbiote: assets.symbiote ? `${assets.symbiote.naturalWidth}x${assets.symbiote.naturalHeight}` : null,
        mask: assets.maskSource ? `${assets.maskSource.naturalWidth}x${assets.maskSource.naturalHeight}` : null
      },
      maskStats: assets.maskStats ? { ...assets.maskStats } : null,
      pointer: { ...pointer },
      zoneWeights: {
        left: pointer.weightLeft,
        center: pointer.weightCenter,
        right: pointer.weightRight
      },
      anatomicalAnchors: liquidField ? liquidField.getAnchors() : ANATOMICAL_ANCHORS,
      liquid: liquidField ? liquidField.getStats() : null,
      tendrils: tendrilSystem ? tendrilSystem.getStats() : null,
      canvasCount: document.querySelectorAll('canvas').length
    };
  }
};

init();
