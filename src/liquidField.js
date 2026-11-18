// BLACK MATTER — Phase 3, Step 3: Living Liquid Field & Branching Veins
// Lightweight scalar potential field (182x230) with pre-allocated typed arrays,
// cursor-driven organic metaball lobes, capillary merging, 6-10s Living Memory
// inward self-healing, and tapered biological branching veins.

const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Deterministic hash for fast precomputed 2D smooth value noise
function hash2(ix, iy, seed) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise2D(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);

  const top = a + (b - a) * ux;
  const bot = c + (d - c) * ux;
  return top + (bot - top) * uy;
}

function buildOrganicNoiseField(width, height, seedOffset) {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      // Combine medium organic undulation + finer biological irregularity
      const n1 = valueNoise2D(nx * 9.5, ny * 12.0, 17 + seedOffset);
      const n2 = valueNoise2D(nx * 21.0, ny * 26.5, 53 + seedOffset);
      const n3 = valueNoise2D(nx * 38.0, ny * 48.0, 97 + seedOffset);
      out[y * width + x] = (n1 * 0.56 + n2 * 0.30 + n3 * 0.14) * 2 - 1; // [-1, 1]
    }
  }
  return out;
}

export function createLiquidField({ width, height, maskGrid }) {
  const size = width * height;

  // Pre-allocated simulation buffers (zero per-frame allocations)
  const activeField = new Float32Array(size);
  const memoryField = new Float32Array(size);
  const scratchField = new Float32Array(size);

  // Two static organic noise fields blended smoothly over time for living irregular edges
  const noiseA = buildOrganicNoiseField(width, height, 0);
  const noiseB = buildOrganicNoiseField(width, height, 101);

  // Reusable offscreen liquid alpha mask (182x230, smoothly bilinear-upscaled by compositor)
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d');
  const maskImageData = maskCtx.createImageData(width, height);
  const maskPixels = maskImageData.data;
  // Pre-fill RGB to white once; only alpha channel updates per frame
  for (let i = 0; i < maskPixels.length; i += 4) {
    maskPixels[i] = 255;
    maskPixels[i + 1] = 255;
    maskPixels[i + 2] = 255;
    maskPixels[i + 3] = 0;
  }

  // Reusable 2x-resolution offscreen canvas for crisp, fine tapered biological veins (364x460)
  const veinScale = 2;
  const veinCanvas = document.createElement('canvas');
  veinCanvas.width = width * veinScale;
  veinCanvas.height = height * veinScale;
  const veinCtx = veinCanvas.getContext('2d');

  // ---- Organic Cursor-Chasing Metaball Lobes (Breaks Circular Brush Shape) ----
  const LOBE_COUNT = 9;
  const lobes = [];
  for (let i = 0; i < LOBE_COUNT; i++) {
    const isCore = i === 0;
    const angle = (i / (LOBE_COUNT - 1)) * Math.PI * 2;
    lobes.push({
      isCore,
      x: width * 0.5,
      y: height * 0.5,
      vx: 0,
      vy: 0,
      baseAngle: angle,
      orbitRadius: isCore ? 0 : (7.5 + (i % 3) * 4.5),
      orbitFreq: 0.7 + (i % 4) * 0.37,
      phase: i * 1.43,
      radius: isCore ? 16.5 : (9.5 + (i % 4) * 2.6),
      stiffness: isCore ? 26 : (11 + (i % 5) * 3.1),
      damping: isCore ? 8.2 : (5.2 + (i % 3) * 0.9),
      weight: isCore ? 1.0 : (0.55 + (i % 3) * 0.12)
    });
  }
  let lobesInitialized = false;

  // ---- Pre-Allocated Branching Biological Vein Pool (Zero Per-Frame Allocations) ----
  const MAX_VEINS = 30;
  const MAX_VEIN_PTS = 20;
  const veins = [];
  for (let i = 0; i < MAX_VEINS; i++) {
    veins.push({
      active: false,
      depth: 0, // 0 = primary vein, 1 = secondary branch
      ptsX: new Float32Array(MAX_VEIN_PTS),
      ptsY: new Float32Array(MAX_VEIN_PTS),
      ptsW: new Float32Array(MAX_VEIN_PTS),
      count: 0,
      targetPoints: 12,
      heading: 0,
      stepLen: 2.6,
      baseWidth: 2.0,
      growTimer: 0,
      growInterval: 0.035,
      age: 0,
      holdDuration: 3.4,
      healDuration: 3.2,
      branched: false,
      seed: (i + 1) * 31
    });
  }

  let veinSpawnTimer = 0;
  let frameParity = 0;
  let totalEnergy = 0;
  let memoryCoverage = 0;
  let activeVeinCount = 0;
  let lastCursorGx = width * 0.5;
  let lastCursorGy = height * 0.5;
  let dirty = false;

  function sampleMask(gx, gy) {
    const ix = Math.round(gx);
    const iy = Math.round(gy);
    if (ix < 0 || ix >= width || iy < 0 || iy >= height) return 0;
    return maskGrid[iy * width + ix];
  }

  // Deposit smooth radial metaball potential into a target Float32Array inside local AABB only
  function splatPotential(field, cx, cy, radius, intensity) {
    const r = Math.max(1, radius);
    const invR2 = 1 / (r * r);
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(height - 1, Math.ceil(cy + r));

    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      const dy2 = dy * dy;
      const row = y * width;
      for (let x = x0; x <= x1; x++) {
        const idx = row + x;
        const m = maskGrid[idx];
        if (m <= 0.04) continue; // Strictly respect foreground mask

        const dx = x - cx;
        const d2 = dx * dx + dy2;
        if (d2 >= r * r) continue;

        const q = 1 - d2 * invR2;
        const falloff = q * q; // Smooth C1 metaball kernel
        const add = falloff * intensity * m;
        const next = field[idx] + add;
        field[idx] = next > 1.45 ? 1.45 : next;
      }
    }
  }

  function findFreeVeinSlot() {
    for (let i = 0; i < MAX_VEINS; i++) {
      if (!veins[i].active) return veins[i];
    }
    return null;
  }

  function spawnVein(startX, startY, heading, depth, now) {
    const slot = findFreeVeinSlot();
    if (!slot) return false;
    if (sampleMask(startX, startY) < 0.25) return false;

    const jitter = Math.sin(now * 17.3 + slot.seed) * 0.5 + 0.5;
    slot.active = true;
    slot.depth = depth;
    slot.ptsX[0] = startX;
    slot.ptsY[0] = startY;
    slot.baseWidth = depth === 0
      ? (1.7 + jitter * 1.45)
      : (0.95 + jitter * 0.75);
    slot.ptsW[0] = slot.baseWidth;
    slot.count = 1;
    slot.targetPoints = depth === 0
      ? (10 + Math.floor(jitter * 9)) // 10..18 segments
      : (5 + Math.floor(jitter * 6)); // 5..10 segments
    slot.heading = heading;
    slot.stepLen = depth === 0 ? (2.3 + jitter * 1.4) : (1.9 + jitter * 1.1);
    slot.growTimer = 0;
    slot.growInterval = depth === 0 ? 0.026 : 0.032;
    slot.age = 0;
    // Living Memory lifetime: ~5.5-8.5s total (grow + linger + smooth tip-to-root retraction)
    slot.holdDuration = (depth === 0 ? 3.2 : 2.1) + jitter * 2.0;
    slot.healDuration = (depth === 0 ? 2.8 : 2.0) + jitter * 1.4;
    slot.branched = depth > 0;
    return true;
  }

  function updateVeins(dt, now, cursorActive, cursorGx, cursorGy, cursorSpeed, reduceMotion) {
    // Spawn organic primary veins near the active cursor/frontier inside the subject
    if (cursorActive && sampleMask(cursorGx, cursorGy) > 0.2) {
      veinSpawnTimer -= dt * (1 + clamp(cursorSpeed * 0.012, 0, 1.8));
      const spawnCadence = reduceMotion ? 0.32 : 0.14;
      if (veinSpawnTimer <= 0) {
        veinSpawnTimer = spawnCadence;
        // Pick an organic start offset near the active lobe rim rather than exact cursor center
        const pickLobe = lobes[1 + (Math.floor(now * 13) % (LOBE_COUNT - 1))];
        const offsetAngle = (now * 2.7 + activeVeinCount * 2.1) % (Math.PI * 2);
        const startX = pickLobe.x + Math.cos(offsetAngle) * (pickLobe.radius * 0.55);
        const startY = pickLobe.y + Math.sin(offsetAngle) * (pickLobe.radius * 0.55);

        // Bias initial heading outward away from cursor core with organic irregularity
        const outAngle = Math.atan2(startY - cursorGy, startX - cursorGx)
          + Math.sin(now * 9.1 + offsetAngle) * 0.65;
        spawnVein(startX, startY, outAngle, 0, now);
      }
    }

    let liveCount = 0;
    for (let i = 0; i < MAX_VEINS; i++) {
      const v = veins[i];
      if (!v.active) continue;

      v.age += dt;

      // Advance organic curved growth until targetPoints reached
      if (v.count < v.targetPoints) {
        v.growTimer += dt;
        while (v.growTimer >= v.growInterval && v.count < v.targetPoints) {
          v.growTimer -= v.growInterval;

          const prevX = v.ptsX[v.count - 1];
          const prevY = v.ptsY[v.count - 1];
          const gx = clamp(Math.floor(prevX), 0, width - 1);
          const gy = clamp(Math.floor(prevY), 0, height - 1);
          const nVal = noiseA[gy * width + gx];
          const nVal2 = noiseB[gy * width + gx];

          // Irregular biological wandering + gentle pull toward active cursor if nearby
          let turn = (nVal * 0.55 + Math.sin(v.count * 1.3 + v.seed) * 0.24);
          if (cursorActive) {
            const dcx = cursorGx - prevX;
            const dcy = cursorGy - prevY;
            const dCursor = Math.hypot(dcx, dcy);
            if (dCursor > 8 && dCursor < 48) {
              const toCursor = Math.atan2(dcy, dcx);
              let diff = toCursor - v.heading;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              turn += clamp(diff, -0.35, 0.35) * 0.35;
            }
          }

          let nextHeading = v.heading + turn;
          let nx = prevX + Math.cos(nextHeading) * v.stepLen;
          let ny = prevY + Math.sin(nextHeading) * v.stepLen;

          // Strictly constrain vein growth inside the foreground silhouette
          if (sampleMask(nx, ny) < 0.16) {
            // Try gentle deflection left or right along the subject boundary before terminating
            const altA = nextHeading + 0.65;
            const altB = nextHeading - 0.65;
            const ax = prevX + Math.cos(altA) * v.stepLen;
            const ay = prevY + Math.sin(altA) * v.stepLen;
            const bx = prevX + Math.cos(altB) * v.stepLen;
            const by = prevY + Math.sin(altB) * v.stepLen;

            if (sampleMask(ax, ay) >= 0.18) {
              nextHeading = altA;
              nx = ax; ny = ay;
            } else if (sampleMask(bx, by) >= 0.18) {
              nextHeading = altB;
              nx = bx; ny = by;
            } else {
              v.targetPoints = v.count;
              break;
            }
          }

          v.heading = nextHeading;
          const progress = v.count / Math.max(1, v.targetPoints - 1);
          const organicPulse = 0.85 + 0.28 * Math.abs(nVal2);
          v.ptsX[v.count] = nx;
          v.ptsY[v.count] = ny;
          v.ptsW[v.count] = v.baseWidth * Math.pow(1 - progress * 0.86, 1.15) * organicPulse;
          v.count++;

          // Deposit soft potential along thicker basal/mid trunk so nearby veins merge organically
          if (progress < 0.65) {
            splatPotential(memoryField, nx, ny, 2.8 + v.baseWidth * 0.85, 0.22 * (1 - progress * 0.6));
          }

          // Occasional secondary biological branch off primary veins
          if (!v.branched && v.depth === 0 && v.count >= 4 && v.count <= v.targetPoints - 3) {
            if (Math.abs(nVal) > 0.36) {
              v.branched = true;
              const side = nVal >= 0 ? 1 : -1;
              const branchAngle = v.heading + side * (0.52 + Math.abs(nVal2) * 0.42);
              spawnVein(nx, ny, branchAngle, 1, now);
            }
          }
        }
      }

      // If cursor passes close to an existing vein, refresh its Living Memory slightly
      if (cursorActive && v.count > 2) {
        const midIdx = v.count >> 1;
        const dMid = Math.hypot(v.ptsX[midIdx] - cursorGx, v.ptsY[midIdx] - cursorGy);
        if (dMid < 20 && v.age > 0.6) {
          v.age = Math.max(0.6, v.age - dt * 1.4);
        }
      }

      const totalLife = v.holdDuration + v.healDuration;
      if (v.age >= totalLife) {
        v.active = false;
        continue;
      }

      liveCount++;
    }

    activeVeinCount = liveCount;
  }

  function renderVeinsToCanvas() {
    veinCtx.clearRect(0, 0, veinCanvas.width, veinCanvas.height);
    if (activeVeinCount === 0) return;

    veinCtx.lineCap = 'round';
    veinCtx.lineJoin = 'round';

    for (let i = 0; i < MAX_VEINS; i++) {
      const v = veins[i];
      if (!v.active || v.count < 2) continue;

      // Compute smooth Living Memory tip-to-root retraction during heal phase
      let drawFrac = 1;
      let alpha = 1;
      if (v.age > v.holdDuration) {
        const healT = clamp((v.age - v.holdDuration) / v.healDuration, 0, 1);
        const eased = healT * healT * (3 - 2 * healT);
        drawFrac = Math.max(0, 1 - eased * 0.92);
        alpha = Math.max(0, 1 - eased);
      }
      if (alpha <= 0.02 || drawFrac <= 0.05) continue;

      const maxSeg = Math.max(1, Math.floor((v.count - 1) * drawFrac));
      const widthScale = veinScale * (0.35 + 0.65 * alpha);
      veinCtx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;

      // Draw smooth quadratic midpoint segments with continuous tapering thickness
      for (let j = 0; j < maxSeg; j++) {
        const x0 = v.ptsX[j] * veinScale;
        const y0 = v.ptsY[j] * veinScale;
        const x1 = v.ptsX[j + 1] * veinScale;
        const y1 = v.ptsY[j + 1] * veinScale;

        const wSeg = Math.max(0.65, (v.ptsW[j] + v.ptsW[j + 1]) * 0.5 * widthScale);
        veinCtx.lineWidth = wSeg;

        veinCtx.beginPath();
        if (j === 0) {
          const mx = (x0 + x1) * 0.5;
          const my = (y0 + y1) * 0.5;
          veinCtx.moveTo(x0, y0);
          veinCtx.lineTo(mx, my);
        } else {
          const px = v.ptsX[j - 1] * veinScale;
          const py = v.ptsY[j - 1] * veinScale;
          const mx0 = (px + x0) * 0.5;
          const my0 = (py + y0) * 0.5;
          const mx1 = (x0 + x1) * 0.5;
          const my1 = (y0 + y1) * 0.5;
          veinCtx.moveTo(mx0, my0);
          veinCtx.quadraticCurveTo(x0, y0, mx1, my1);
        }
        veinCtx.stroke();
      }
    }
  }

  function step(dt, now, pointerInfo, reduceMotion) {
    const cursorActive = Boolean(pointerInfo.active && pointerInfo.nearPhoto);
    const cursorGx = pointerInfo.u * width;
    const cursorGy = pointerInfo.v * height;
    const cursorVx = (pointerInfo.du || 0) * width;
    const cursorVy = (pointerInfo.dv || 0) * height;
    const cursorSpeed = Math.hypot(cursorVx, cursorVy);

    // 1. Update cursor-chasing organic metaball lobes
    if (cursorActive) {
      if (!lobesInitialized) {
        for (let i = 0; i < LOBE_COUNT; i++) {
          lobes[i].x = cursorGx;
          lobes[i].y = cursorGy;
          lobes[i].vx = 0;
          lobes[i].vy = 0;
        }
        lobesInitialized = true;
      }

      const moveAngle = cursorSpeed > 4 ? Math.atan2(cursorVy, cursorVx) : 0;
      const stretchBoost = clamp(cursorSpeed * 0.09, 0, 12);

      for (let i = 0; i < LOBE_COUNT; i++) {
        const l = lobes[i];
        let targetX = cursorGx;
        let targetY = cursorGy;

        if (!l.isCore) {
          const ang = l.baseAngle + (reduceMotion ? 0 : now * l.orbitFreq + Math.sin(now * 0.9 + l.phase) * 0.55);
          const rad = l.orbitRadius * (0.85 + 0.3 * Math.sin(now * 1.4 + l.phase));
          // Trail slightly behind rapid cursor movement so liquid elongates organically
          const trailAmt = (i % 3 === 0) ? stretchBoost : stretchBoost * 0.4;
          targetX = cursorGx + Math.cos(ang) * rad - Math.cos(moveAngle) * trailAmt;
          targetY = cursorGy + Math.sin(ang) * rad - Math.sin(moveAngle) * trailAmt;
        }

        const k = reduceMotion ? l.stiffness * 0.7 : l.stiffness;
        const c = reduceMotion ? l.damping * 1.4 : l.damping;
        l.vx += ((targetX - l.x) * k - l.vx * c) * dt;
        l.vy += ((targetY - l.y) * k - l.vy * c) * dt;
        l.x += l.vx * dt;
        l.y += l.vy * dt;

        // Splat organic potential into activeField (local AABB, mask-constrained)
        const deposit = (2.15 + clamp(cursorSpeed * 0.015, 0, 1.4)) * dt * l.weight;
        splatPotential(activeField, l.x, l.y, l.radius, deposit);
      }

      // Bridge rapid cursor gaps so fast movement leaves continuous organic flow, not detached dots
      const jumpDist = Math.hypot(cursorGx - lastCursorGx, cursorGy - lastCursorGy);
      if (jumpDist > 5 && jumpDist < 95) {
        const steps = Math.min(6, Math.ceil(jumpDist / 8));
        for (let s = 1; s < steps; s++) {
          const f = s / steps;
          const bx = lastCursorGx + (cursorGx - lastCursorGx) * f;
          const by = lastCursorGy + (cursorGy - lastCursorGy) * f;
          splatPotential(activeField, bx, by, 11.5, 0.24);
        }
      }
      lastCursorGx = cursorGx;
      lastCursorGy = cursorGy;
    } else if (totalEnergy < 0.005 && activeVeinCount === 0) {
      lobesInitialized = false;
      if (dirty) {
        for (let i = 0; i < maskPixels.length; i += 4) {
          maskPixels[i + 3] = 0;
        }
        maskCtx.putImageData(maskImageData, 0, 0);
        veinCtx.clearRect(0, 0, veinCanvas.width, veinCanvas.height);
        dirty = false;
      }
      return false;
    }

    // 2. Update branching biological veins
    updateVeins(dt, now, cursorActive, cursorGx, cursorGy, cursorSpeed, reduceMotion);

    // 3. Evolve activeField (fast organic retreat) + memoryField (Living Memory 6-10s inward self-healing)
    const activeDecay = Math.exp(-(cursorActive ? 2.1 : 2.7) * dt);
    const chargeRate = 1.95 * dt;
    const doDiffuse = (++frameParity & 1) === 0;

    // Optional light capillary diffusion on alternate frames so nearby regions merge smoothly
    if (doDiffuse) {
      scratchField.set(memoryField);
      for (let y = 1; y < height - 1; y++) {
        const row = y * width;
        for (let x = 1; x < width - 1; x++) {
          const idx = row + x;
          const m = maskGrid[idx];
          if (m <= 0.04) {
            memoryField[idx] = 0;
            continue;
          }
          const c = scratchField[idx];
          const avg = 0.25 * (
            scratchField[idx - 1] +
            scratchField[idx + 1] +
            scratchField[idx - width] +
            scratchField[idx + width]
          );
          // Skip untouched empty cells quickly
          if (c === 0 && avg < 0.01) continue;
          // Gentle capillary merging when neighbors are stronger
          memoryField[idx] = (c + (avg - c) * 0.14) * m;
        }
      }
    }

    // Smooth time-varying blend weights for organic noise edges (computed ONCE per frame)
    const nCos = reduceMotion ? 1 : Math.cos(now * 0.55);
    const nSin = reduceMotion ? 0 : Math.sin(now * 0.55);

    let maxEnergy = 0;
    let coveredCells = 0;
    let subjectCells = 0;

    for (let y = 0; y < height; y++) {
      const row = y * width;
      const hasUp = y > 0;
      const hasDown = y < height - 1;

      for (let x = 0; x < width; x++) {
        const idx = row + x;
        const m = maskGrid[idx];
        if (m <= 0.03) {
          activeField[idx] = 0;
          memoryField[idx] = 0;
          maskPixels[idx * 4 + 3] = 0;
          continue;
        }
        subjectCells++;

        // Active field smoothly retreats once cursor moves away
        let a = activeField[idx] * activeDecay;
        if (a < 0.002) a = 0;
        activeField[idx] = a;

        // Memory field charges from strong active influence, then self-heals from outer edges inward (~6-10s)
        let mem = memoryField[idx];
        if (a > 0.22) {
          mem = Math.min(1.0, mem + (a - 0.18) * chargeRate);
        } else if (mem > 0) {
          // Sample 4-neighbor support: outer edges erode faster, deep interior lingers longer
          const nL = x > 0 ? memoryField[idx - 1] : 0;
          const nR = x < width - 1 ? memoryField[idx + 1] : 0;
          const nU = hasUp ? memoryField[idx - width] : 0;
          const nD = hasDown ? memoryField[idx + width] : 0;
          const nbAvg = 0.25 * (nL + nR + nU + nD);

          const edgeExposure = clamp(1 - nbAvg * 1.15, 0, 1);
          const noiseMod = 0.84 + 0.32 * Math.abs(noiseA[idx]);
          // Core decays ~0.095/s, exposed edges erode ~0.22/s -> full self-heal in ~6.5-9.5 seconds
          const healRate = (0.095 + edgeExposure * 0.125) * noiseMod;
          mem = Math.max(0, mem - healRate * dt);
        }
        memoryField[idx] = mem;

        const combined = a * 0.78 + mem;
        if (combined > maxEnergy) maxEnergy = combined;

        if (combined <= 0.04) {
          maskPixels[idx * 4 + 3] = 0;
          continue;
        }

        // Apply living organic noise modulation around the liquid iso-threshold (no circular edges!)
        const organicWave = (noiseA[idx] * nCos + noiseB[idx] * nSin) * 0.14;
        const fieldVal = combined + organicWave;

        // Smooth viscous threshold creates connected merging puddles without hard pixelated edges
        const alpha = sstep(0.30, 0.56, fieldVal) * m;
        if (alpha > 0.35) coveredCells++;
        maskPixels[idx * 4 + 3] = Math.round(alpha * 255);
      }
    }

    totalEnergy = maxEnergy;
    memoryCoverage = subjectCells > 0 ? coveredCells / subjectCells : 0;

    // Upload updated low-res alpha field & render crisp branching veins
    maskCtx.putImageData(maskImageData, 0, 0);
    renderVeinsToCanvas();
    dirty = true;

    return totalEnergy >= 0.005 || activeVeinCount > 0 || cursorActive;
  }

  function reset() {
    activeField.fill(0);
    memoryField.fill(0);
    scratchField.fill(0);
    for (let i = 0; i < MAX_VEINS; i++) {
      veins[i].active = false;
    }
    for (let i = 0; i < maskPixels.length; i += 4) {
      maskPixels[i + 3] = 0;
    }
    maskCtx.putImageData(maskImageData, 0, 0);
    veinCtx.clearRect(0, 0, veinCanvas.width, veinCanvas.height);
    totalEnergy = 0;
    memoryCoverage = 0;
    activeVeinCount = 0;
    lobesInitialized = false;
    dirty = false;
  }

  function sampleFieldAtUV(u, v, outObj) {
    const gx = Math.round(u * (width - 1));
    const gy = Math.round(v * (height - 1));
    if (gx < 0 || gx >= width || gy < 0 || gy >= height) {
      outObj.field = 0;
      outObj.memory = 0;
      outObj.active = 0;
      outObj.mask = 0;
      return outObj;
    }
    const idx = gy * width + gx;
    const m = maskGrid[idx];
    const a = activeField[idx];
    const mem = memoryField[idx];
    outObj.mask = m;
    outObj.active = a;
    outObj.memory = mem;
    outObj.field = (a * 0.78 + mem) * m;
    return outObj;
  }

  // Finds an irregular, mask-validated symbiote root point near active lobes / transformed frontier.
  // Writes into caller-provided `outRoot` to avoid per-frame object allocations.
  function findSpawnRoot(cursorU, cursorV, seed, outRoot) {
    outRoot.found = false;
    if (totalEnergy < 0.28) return false;

    const baseLobeIdx = Math.abs(Math.floor(seed * 97)) % LOBE_COUNT;
    for (let attempt = 0; attempt < 12; attempt++) {
      const lobe = lobes[(baseLobeIdx + attempt * 3) % LOBE_COUNT];
      const ang = seed * 6.28318 + attempt * 2.39996; // Golden angle avoids symmetric placement
      const ring = 0.25 + ((attempt * 0.37 + seed) % 0.75);
      const gx = clamp(Math.round(lobe.x + Math.cos(ang) * lobe.radius * ring), 1, width - 2);
      const gy = clamp(Math.round(lobe.y + Math.sin(ang) * lobe.radius * ring), 1, height - 2);

      const idx = gy * width + gx;
      const m = maskGrid[idx];
      if (m < 0.45) continue; // Strictly keep roots inside foreground silhouette

      const strength = (activeField[idx] * 0.78 + memoryField[idx]) * m;
      if (strength < 0.36) continue;

      // Compute outward normal from field gradient (points toward cursor / frontier exterior)
      const fL = activeField[idx - 1] * 0.78 + memoryField[idx - 1];
      const fR = activeField[idx + 1] * 0.78 + memoryField[idx + 1];
      const fU = activeField[idx - width] * 0.78 + memoryField[idx - width];
      const fD = activeField[idx + width] * 0.78 + memoryField[idx + width];
      let nx = fL - fR;
      let ny = fU - fD;
      const nLen = Math.hypot(nx, ny);

      const u = (gx + 0.5) / width;
      const v = (gy + 0.5) / height;
      if (nLen > 0.02) {
        nx /= nLen;
        ny /= nLen;
      } else {
        const dx = cursorU - u;
        const dy = cursorV - v;
        const dLen = Math.hypot(dx, dy) || 1;
        nx = dx / dLen;
        ny = dy / dLen;
      }

      outRoot.found = true;
      outRoot.u = u;
      outRoot.v = v;
      outRoot.nx = nx;
      outRoot.ny = ny;
      return true;
    }

    return false;
  }

  // Subtle root blending deposit so tendril roots visually merge into the living liquid body
  // without extending the 6-10s Living Memory healing window
  function depositRootInfluence(u, v, radiusUV, intensity) {
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    const gx = u * width;
    const gy = v * height;
    const r = Math.max(1.8, radiusUV * width);
    splatPotential(activeField, gx, gy, r, intensity);
  }

  return {
    step,
    reset,
    sampleFieldAtUV,
    findSpawnRoot,
    depositRootInfluence,
    getFieldCanvas: () => maskCanvas,
    getVeinCanvas: () => veinCanvas,
    isActive: () => totalEnergy >= 0.005 || activeVeinCount > 0,
    getStats: () => ({
      width,
      height,
      totalEnergy: Number(totalEnergy.toFixed(4)),
      coverageRatio: Number(memoryCoverage.toFixed(4)),
      activeVeins: activeVeinCount,
      lobeCount: LOBE_COUNT,
      dormant: totalEnergy < 0.005 && activeVeinCount === 0
    })
  };
}
