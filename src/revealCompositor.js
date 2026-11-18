// BLACK MATTER — Phase 3, Step 4: Masked Symbiote Reveal & Glossy Tendril Compositor
// Owns reusable offscreen compositing buffers for:
//   1. Full-mask debug verification (complete symbiote clipped to alphaMaskCanvas)
//   2. Step 2 soft radial cursor reveal helper (preserved)
//   3. Step 3 living liquid field + branching vein reveal strictly constrained by alphaMaskCanvas
//   4. Step 4 dedicated glossy obsidian tendril layer (never weakens foreground alpha masking)

import { TENDRIL_STATE } from './tendrils.js';

const BRUSH_STAMP_SIZE = 256;
const RIBBON_SAMPLES = 24; // Smooth Catmull-Rom subdivisions per tendril (zero polygonal kinks)

// Pre-render a smooth soft-edged radial mask stamp once so the render loop allocates zero gradients
function createSoftBrushStamp() {
  const stamp = document.createElement('canvas');
  stamp.width = BRUSH_STAMP_SIZE;
  stamp.height = BRUSH_STAMP_SIZE;
  const sctx = stamp.getContext('2d');
  if (!sctx) return stamp;

  const half = BRUSH_STAMP_SIZE / 2;
  const grad = sctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.32, 'rgba(255, 255, 255, 0.96)');
  grad.addColorStop(0.58, 'rgba(255, 255, 255, 0.62)');
  grad.addColorStop(0.80, 'rgba(255, 255, 255, 0.20)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, BRUSH_STAMP_SIZE, BRUSH_STAMP_SIZE);
  return stamp;
}

// Uniform Catmull-Rom spline interpolation for smooth organic tendril silhouettes
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

export function createRevealCompositor() {
  // Primary reveal buffer (resized only on viewport/DPR change)
  const buffer = document.createElement('canvas');
  const bctx = buffer.getContext('2d');

  // Secondary reusable buffer for subtle biological obsidian depth on fine creeping veins
  const veinBuffer = document.createElement('canvas');
  const vctx = veinBuffer.getContext('2d');

  // Dedicated reusable offscreen layer for glossy obsidian tendrils (separate from photo mask)
  const tendrilBuffer = document.createElement('canvas');
  const tctx = tendrilBuffer.getContext('2d');

  const brushStamp = createSoftBrushStamp();

  // Pre-allocated typed ribbon arrays (zero per-frame allocations during tendril rendering)
  const sampleCount = RIBBON_SAMPLES + 1;
  const smoothX = new Float32Array(sampleCount);
  const smoothY = new Float32Array(sampleCount);
  const smoothW = new Float32Array(sampleCount);
  const leftX = new Float32Array(sampleCount);
  const leftY = new Float32Array(sampleCount);
  const rightX = new Float32Array(sampleCount);
  const rightY = new Float32Array(sampleCount);

  let width = 1;
  let height = 1;
  let dpr = 1;

  function resize(displayW, displayH, nextDpr) {
    width = Math.max(1, displayW);
    height = Math.max(1, displayH);
    dpr = Math.max(1, nextDpr);

    const pw = Math.round(width * dpr);
    const ph = Math.round(height * dpr);
    buffer.width = pw;
    buffer.height = ph;
    veinBuffer.width = pw;
    veinBuffer.height = ph;
    tendrilBuffer.width = pw;
    tendrilBuffer.height = ph;
  }

  // Full-mask debug mode: reveals 100% of the symbiote strictly inside alphaMaskCanvas
  function composeFullMask(symbioteImg, alphaMaskCanvas) {
    if (!bctx || !symbioteImg || !alphaMaskCanvas) return null;

    bctx.save();
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, width, height);
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = 'high';

    bctx.globalCompositeOperation = 'source-over';
    bctx.drawImage(alphaMaskCanvas, 0, 0, width, height);

    bctx.globalCompositeOperation = 'source-in';
    bctx.drawImage(symbioteImg, 0, 0, width, height);
    bctx.restore();

    return buffer;
  }

  // Preserved Step 2 helper: soft-edged radial cursor reveal strictly constrained by alphaMaskCanvas
  function composeCursorReveal(symbioteImg, alphaMaskCanvas, u, v, strength, radiusPx) {
    if (!bctx || !symbioteImg || !alphaMaskCanvas || strength <= 0.001 || radiusPx <= 1) {
      return null;
    }

    const cx = u * width;
    const cy = v * height;

    bctx.save();
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, width, height);
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = 'high';

    bctx.globalCompositeOperation = 'source-over';
    bctx.globalAlpha = Math.max(0, Math.min(1, strength));
    bctx.drawImage(brushStamp, cx - radiusPx, cy - radiusPx, radiusPx * 2, radiusPx * 2);

    bctx.globalAlpha = 1;
    bctx.globalCompositeOperation = 'destination-in';
    bctx.drawImage(alphaMaskCanvas, 0, 0, width, height);

    bctx.globalCompositeOperation = 'source-in';
    bctx.drawImage(symbioteImg, 0, 0, width, height);
    bctx.restore();

    return buffer;
  }

  // Step 3 Living Liquid Field + Branching Veins compositor:
  // Enforces finalReveal = (liquidField ∪ branchingVeins) × foregroundAlphaMask
  function composeLiquidReveal(symbioteImg, alphaMaskCanvas, fieldCanvas, veinCanvas, hasVeins) {
    if (!bctx || !symbioteImg || !alphaMaskCanvas || !fieldCanvas) return null;

    bctx.save();
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, width, height);
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = 'high';

    bctx.globalCompositeOperation = 'source-over';
    bctx.drawImage(fieldCanvas, 0, 0, width, height);

    if (hasVeins && veinCanvas) {
      bctx.drawImage(veinCanvas, 0, 0, width, height);
    }

    bctx.globalCompositeOperation = 'destination-in';
    bctx.drawImage(alphaMaskCanvas, 0, 0, width, height);

    bctx.globalCompositeOperation = 'source-in';
    bctx.drawImage(symbioteImg, 0, 0, width, height);

    if (hasVeins && veinCanvas && vctx) {
      vctx.save();
      vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      vctx.clearRect(0, 0, width, height);
      vctx.imageSmoothingEnabled = true;
      vctx.imageSmoothingQuality = 'high';

      vctx.globalCompositeOperation = 'source-over';
      vctx.drawImage(veinCanvas, 0, 0, width, height);

      vctx.globalCompositeOperation = 'destination-in';
      vctx.drawImage(alphaMaskCanvas, 0, 0, width, height);

      vctx.globalCompositeOperation = 'source-in';
      vctx.fillStyle = 'rgba(7, 8, 12, 0.56)';
      vctx.fillRect(0, 0, width, height);
      vctx.restore();

      bctx.globalCompositeOperation = 'source-over';
      bctx.drawImage(veinBuffer, 0, 0, width, height);
    }

    bctx.restore();
    return buffer;
  }

  // Renders one muscular glossy obsidian tendril onto tendrilBuffer in photoRect-local space
  function drawTendrilBody(t, segCount) {
    const maxIdx = segCount - 1;

    // 1. Sample smooth Catmull-Rom spline along the 8 physical spring nodes
    for (let j = 0; j <= RIBBON_SAMPLES; j++) {
      const f = (j / RIBBON_SAMPLES) * maxIdx;
      const i1 = Math.min(maxIdx, Math.floor(f));
      const localT = f - i1;
      const i0 = Math.max(0, i1 - 1);
      const i2 = Math.min(maxIdx, i1 + 1);
      const i3 = Math.min(maxIdx, i1 + 2);

      smoothX[j] = catmullRom(t.px[i0], t.px[i1], t.px[i2], t.px[i3], localT) * width;
      smoothY[j] = catmullRom(t.py[i0], t.py[i1], t.py[i2], t.py[i3], localT) * height;
      // Linear interpolate physical width in pixels (scaled by photoRect width)
      const wUV = t.widths[i1] + (t.widths[i2] - t.widths[i1]) * localT;
      smoothW[j] = Math.max(0.65, wUV * width);
    }

    // 2. Build left/right ribbon contours perpendicular to smooth spine tangent
    for (let j = 0; j <= RIBBON_SAMPLES; j++) {
      const prev = Math.max(0, j - 1);
      const next = Math.min(RIBBON_SAMPLES, j + 1);
      const dtx = smoothX[next] - smoothX[prev];
      const dty = smoothY[next] - smoothY[prev];
      const dLen = Math.hypot(dtx, dty) || 1;
      const nx = -dty / dLen;
      const ny = dtx / dLen;
      const halfW = smoothW[j];

      leftX[j] = smoothX[j] + nx * halfW;
      leftY[j] = smoothY[j] + ny * halfW;
      rightX[j] = smoothX[j] - nx * halfW;
      rightY[j] = smoothY[j] - ny * halfW;
    }

    const alpha = Math.max(0, Math.min(1, t.opacity));
    if (alpha <= 0.02) return;

    tctx.save();
    tctx.globalAlpha = alpha;

    // Pass A: Soft organic grounded shadow (subtle offset, zero expensive shadowBlur)
    const shOffY = Math.max(2.5, width * 0.007);
    const shOffX = Math.max(1.2, width * 0.003);
    tctx.beginPath();
    tctx.moveTo(leftX[0] + shOffX, leftY[0] + shOffY);
    for (let j = 1; j <= RIBBON_SAMPLES; j++) {
      tctx.lineTo(leftX[j] + shOffX, leftY[j] + shOffY);
    }
    for (let j = RIBBON_SAMPLES; j >= 0; j--) {
      tctx.lineTo(rightX[j] + shOffX, rightY[j] + shOffY);
    }
    tctx.closePath();
    tctx.fillStyle = 'rgba(20, 18, 32, 0.22)';
    tctx.fill();

    // Pass B: Rounded muscular obsidian silhouette with smooth rounded root & tapered tip
    tctx.beginPath();
    tctx.moveTo(leftX[0], leftY[0]);
    for (let j = 1; j <= RIBBON_SAMPLES; j++) {
      tctx.lineTo(leftX[j], leftY[j]);
    }
    const tipR = Math.max(0.75, smoothW[RIBBON_SAMPLES]);
    const tipAng = Math.atan2(
      rightY[RIBBON_SAMPLES] - leftY[RIBBON_SAMPLES],
      rightX[RIBBON_SAMPLES] - leftX[RIBBON_SAMPLES]
    );
    tctx.arc(smoothX[RIBBON_SAMPLES], smoothY[RIBBON_SAMPLES], tipR, tipAng + Math.PI, tipAng, false);
    for (let j = RIBBON_SAMPLES; j >= 0; j--) {
      tctx.lineTo(rightX[j], rightY[j]);
    }
    tctx.closePath();
    tctx.fillStyle = '#050508';
    tctx.fill();

    // Pass C: Subtle inner muscular core shading (gives rounded 3D cylindrical volume)
    tctx.beginPath();
    for (let j = 1; j < RIBBON_SAMPLES; j++) {
      const cx = smoothX[j] - smoothW[j] * 0.16;
      const cy = smoothY[j] - smoothW[j] * 0.14;
      if (j === 1) tctx.moveTo(cx, cy);
      else tctx.lineTo(cx, cy);
    }
    tctx.strokeStyle = 'rgba(32, 36, 48, 0.42)';
    tctx.lineWidth = Math.max(0.9, smoothW[Math.floor(RIBBON_SAMPLES * 0.35)] * 0.72);
    tctx.lineCap = 'round';
    tctx.lineJoin = 'round';
    tctx.stroke();

    // Pass D: Wet obsidian specular highlight ridge aligned with portrait's left-side key light
    tctx.beginPath();
    for (let j = 1; j < RIBBON_SAMPLES; j++) {
      // Shift highlight slightly left/upward toward the natural key light
      const hx = smoothX[j] - smoothW[j] * 0.36;
      const hy = smoothY[j] - smoothW[j] * 0.28;
      if (j === 1) tctx.moveTo(hx, hy);
      else tctx.lineTo(hx, hy);
    }
    const specAlpha = Math.max(0.14, Math.min(0.42, (0.36 - t.tension * 0.12) * (t.depth === 0 ? 1 : 0.8)));
    tctx.strokeStyle = `rgba(218, 232, 255, ${specAlpha.toFixed(3)})`;
    tctx.lineWidth = Math.max(0.6, smoothW[Math.floor(RIBBON_SAMPLES * 0.3)] * 0.24);
    tctx.lineCap = 'round';
    tctx.lineJoin = 'round';
    tctx.stroke();

    // Soft glossy glint near tip when bulbous enough
    if (tipR > 1.35) {
      tctx.beginPath();
      tctx.arc(smoothX[RIBBON_SAMPLES] - tipR * 0.28, smoothY[RIBBON_SAMPLES] - tipR * 0.26, tipR * 0.32, 0, Math.PI * 2);
      tctx.fillStyle = 'rgba(235, 244, 255, 0.34)';
      tctx.fill();
    }

    tctx.restore();
  }

  // Renders the briefly fading severed tip filament after a clean snap (no droplets/splashes)
  function drawFadingSnappedTip(t) {
    if (t.tipFadeAlpha <= 0.02) return;
    const x0 = t.tipFadeU0 * width;
    const y0 = t.tipFadeV0 * height;
    const x1 = t.tipFadeU1 * width;
    const y1 = t.tipFadeV1 * height;
    const wPx = Math.max(0.7, t.tipFadeWidth * width * t.tipFadeAlpha);

    tctx.save();
    tctx.globalAlpha = t.tipFadeAlpha * 0.88;
    tctx.lineCap = 'round';
    tctx.strokeStyle = '#060609';
    tctx.lineWidth = wPx * 1.4;
    tctx.beginPath();
    tctx.moveTo(x0, y0);
    tctx.lineTo(x1, y1);
    tctx.stroke();

    tctx.strokeStyle = 'rgba(215, 230, 255, 0.28)';
    tctx.lineWidth = Math.max(0.5, wPx * 0.32);
    tctx.beginPath();
    tctx.moveTo(x0 - wPx * 0.25, y0 - wPx * 0.2);
    tctx.lineTo(x1 - wPx * 0.2, y1 - wPx * 0.18);
    tctx.stroke();
    tctx.restore();
  }

  // Step 4 dedicated glossy tendril layer (separate from foreground photo alpha mask)
  function composeTendrils(tendrilSystem) {
    if (!tctx || !tendrilSystem || !tendrilSystem.isActive()) return null;

    tctx.save();
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tctx.clearRect(0, 0, width, height);

    const pool = tendrilSystem.pool;
    const segCount = tendrilSystem.SEG_COUNT;

    // Draw secondary branches slightly behind primary trunks for natural visual depth
    for (let pass = 0; pass < 2; pass++) {
      const targetDepth = pass === 0 ? 1 : 0;
      for (let i = 0; i < pool.length; i++) {
        const t = pool[i];
        if (t.depth !== targetDepth) continue;
        if (t.state !== TENDRIL_STATE.DORMANT) {
          drawTendrilBody(t, segCount);
        }
        if (t.tipFadeAlpha > 0.02) {
          drawFadingSnappedTip(t);
        }
      }
    }

    tctx.restore();
    return tendrilBuffer;
  }

  return {
    resize,
    composeFullMask,
    composeCursorReveal,
    composeLiquidReveal,
    composeTendrils
  };
}
