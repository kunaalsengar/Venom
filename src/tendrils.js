// BLACK MATTER — Phase 3, Step 4: Dynamic Tendril Physics, Snapping & Recoil
// Fixed-capacity pre-allocated tendril pool running multi-node spring-chain physics
// in normalized portrait UV space [0..1], tightly integrated with src/liquidField.js.

const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export const TENDRIL_STATE = Object.freeze({
  DORMANT: 0,
  GROWING: 1,
  ATTACHED: 2,
  STRETCHING: 3,
  SNAPPING: 4,
  RECOILING: 5
});

const STATE_NAMES = ['dormant', 'growing', 'attached', 'stretching', 'snapping', 'recoiling'];

export function createTendrilSystem({ liquidField, aspectRatio }) {
  const MAX_PRIMARY = 10;
  const MAX_SECONDARY = 6;
  const MAX_TENDRILS = MAX_PRIMARY + MAX_SECONDARY;
  const SEG_COUNT = 8; // Node 0 = root, Nodes 1..6 = interior spring chain, Node 7 = tip

  // Aspect correction so distances/angles in UV space feel isotropic on the 907x1147 portrait
  const invAspect = 1 / Math.max(0.2, aspectRatio || 0.79076);

  // Pre-allocated fixed tendril pool (zero per-frame allocations)
  const pool = [];
  for (let i = 0; i < MAX_TENDRILS; i++) {
    pool.push({
      id: i,
      depth: i < MAX_PRIMARY ? 0 : 1,
      parentId: -1,
      parentNode: 3,
      hasBranch: false,
      state: TENDRIL_STATE.DORMANT,
      age: 0,
      stateTime: 0,
      cooldown: 0,

      // Root anchor in UV space & outward normal
      rootU: 0.5,
      rootV: 0.5,
      rootNx: 0,
      rootNy: -1,

      // Cursor attachment offset in UV space
      tipOffU: 0,
      tipOffV: 0,

      // Physical personality (varied asymmetrically per spawn)
      baseWidth: 0.011,     // UV width relative to photoRect.w
      rootFlare: 0.022,
      restLen: 0.11,
      maxExtension: 0.30,
      growDuration: 0.24,
      bendDir: 1,
      bendAmp: 0.035,
      waveFreq: 3.1,
      wavePhase: i * 1.618,
      stiffness: 170,
      damping: 14.5,
      curlSign: 1,

      // Live physical metrics
      growth: 0,
      arcLen: 0,
      tension: 0,
      opacity: 0,

      // Detached fading tip stub during SNAPPING / early RECOILING (no droplets/splashes)
      tipFadeAlpha: 0,
      tipFadeU0: 0,
      tipFadeV0: 0,
      tipFadeU1: 0,
      tipFadeV1: 0,
      tipFadeVu: 0,
      tipFadeVv: 0,
      tipFadeWidth: 0.004,

      // Pre-allocated segment arrays (8 nodes in UV space)
      px: new Float32Array(SEG_COUNT),
      py: new Float32Array(SEG_COUNT),
      vx: new Float32Array(SEG_COUNT),
      vy: new Float32Array(SEG_COUNT),
      widths: new Float32Array(SEG_COUNT)
    });
  }

  // Reusable scratch objects (zero per-frame heap allocations)
  const tmpSample = { field: 0, memory: 0, active: 0, mask: 0 };
  const tmpRoot = { found: false, u: 0.5, v: 0.5, nx: 0, ny: -1 };
  const stateCounts = {
    dormant: MAX_TENDRILS,
    growing: 0,
    attached: 0,
    stretching: 0,
    snapping: 0,
    recoiling: 0
  };

  let spawnTimer = 0.06;
  let branchTimer = 0.25;
  let seedCounter = 0.173;
  let activeCount = 0;
  let primaryActiveCount = 0;
  let secondaryActiveCount = 0;
  let totalSnaps = 0;

  function nextRand() {
    // Fast deterministic fractional sequence (golden-ratio Weyl step) for organic variation
    seedCounter = (seedCounter + 0.61803398875) % 1;
    const x = Math.sin(seedCounter * 43758.5453) * 0.5 + 0.5;
    return x;
  }

  function uvDist(u0, v0, u1, v1) {
    const du = u1 - u0;
    const dv = (v1 - v0) * invAspect;
    return Math.hypot(du, dv);
  }

  // Prevents excessive visual clutter by rejecting roots right on top of an existing active root
  function isRootTooCrowded(u, v) {
    const minSpacing = 0.048;
    for (let i = 0; i < MAX_PRIMARY; i++) {
      const t = pool[i];
      if (t.state === TENDRIL_STATE.DORMANT) continue;
      if (uvDist(t.rootU, t.rootV, u, v) < minSpacing) return true;
    }
    return false;
  }

  function initChainAtRoot(t, u, v) {
    for (let k = 0; k < SEG_COUNT; k++) {
      t.px[k] = u;
      t.py[k] = v;
      t.vx[k] = 0;
      t.vy[k] = 0;
      t.widths[k] = 0;
    }
  }

  function trySpawnPrimary(cursorU, cursorV, now, reduceMotion) {
    const maxAllowed = reduceMotion ? 4 : MAX_PRIMARY;
    if (primaryActiveCount >= maxAllowed) return false;

    // Pick first available primary slot whose cooldown has expired
    let slot = null;
    for (let i = 0; i < MAX_PRIMARY; i++) {
      if (pool[i].state === TENDRIL_STATE.DORMANT && pool[i].cooldown <= 0) {
        slot = pool[i];
        break;
      }
    }
    if (!slot) return false;

    // Ask liquidField for an irregular, mask-validated root inside active symbiote matter
    const seed = (now * 0.73 + nextRand()) % 1;
    if (!liquidField.findSpawnRoot(cursorU, cursorV, seed, tmpRoot) || !tmpRoot.found) {
      return false;
    }
    if (isRootTooCrowded(tmpRoot.u, tmpRoot.v)) return false;

    const r1 = nextRand();
    const r2 = nextRand();
    const r3 = nextRand();
    const r4 = nextRand();

    slot.state = TENDRIL_STATE.GROWING;
    slot.parentId = -1;
    slot.hasBranch = false;
    slot.age = 0;
    slot.stateTime = 0;
    slot.growth = 0.05;
    slot.tension = 0;
    slot.opacity = 1;
    slot.tipFadeAlpha = 0;

    slot.rootU = tmpRoot.u;
    slot.rootV = tmpRoot.v;
    slot.rootNx = tmpRoot.nx;
    slot.rootNy = tmpRoot.ny;

    // Varied organic cursor target offset so strands don't converge into one robotic point
    const offAng = r1 * Math.PI * 2;
    const offRad = 0.012 + r2 * 0.036;
    slot.tipOffU = Math.cos(offAng) * offRad;
    slot.tipOffV = Math.sin(offAng) * offRad * aspectRatio;

    // Varied muscular thickness, length, curvature & individual break threshold
    const isHeavy = r3 > 0.55;
    slot.baseWidth = isHeavy ? (0.0115 + r4 * 0.0055) : (0.0068 + r4 * 0.0040);
    slot.rootFlare = slot.baseWidth * (2.05 + r1 * 0.55);
    slot.restLen = 0.085 + r2 * 0.065;
    // Individual break limits (staggered snapping — never all at identical distance!)
    slot.maxExtension = (isHeavy ? 0.30 : 0.23) + r3 * 0.14;
    slot.growDuration = 0.17 + r4 * 0.14;
    slot.bendDir = r1 > 0.5 ? 1 : -1;
    slot.bendAmp = 0.024 + r2 * 0.032;
    slot.waveFreq = 2.2 + r3 * 2.1;
    slot.wavePhase = r4 * Math.PI * 2;
    slot.stiffness = isHeavy ? (150 + r1 * 35) : (185 + r2 * 45);
    slot.damping = 2 * Math.sqrt(slot.stiffness) * (reduceMotion ? 0.85 : 0.56);
    slot.curlSign = r2 > 0.5 ? 1 : -1;

    initChainAtRoot(slot, tmpRoot.u, tmpRoot.v);
    return true;
  }

  function trySpawnSecondary(now, reduceMotion) {
    const maxSec = reduceMotion ? 2 : MAX_SECONDARY;
    if (secondaryActiveCount >= maxSec) return false;

    let slot = null;
    for (let i = MAX_PRIMARY; i < MAX_TENDRILS; i++) {
      if (pool[i].state === TENDRIL_STATE.DORMANT && pool[i].cooldown <= 0) {
        slot = pool[i];
        break;
      }
    }
    if (!slot) return false;

    // Pick a suitable active primary tendril that hasn't branched yet
    let parent = null;
    const startIdx = Math.floor(now * 7) % MAX_PRIMARY;
    for (let k = 0; k < MAX_PRIMARY; k++) {
      const cand = pool[(startIdx + k) % MAX_PRIMARY];
      if (
        (cand.state === TENDRIL_STATE.ATTACHED || cand.state === TENDRIL_STATE.STRETCHING) &&
        !cand.hasBranch &&
        cand.arcLen > 0.095 &&
        cand.tension < 0.72
      ) {
        parent = cand;
        break;
      }
    }
    if (!parent) return false;

    const r1 = nextRand();
    const r2 = nextRand();
    const r3 = nextRand();
    const attachNode = 2 + Math.floor(r1 * 3); // Node 2, 3, or 4 along parent spine

    parent.hasBranch = true;
    slot.state = TENDRIL_STATE.GROWING;
    slot.parentId = parent.id;
    slot.parentNode = attachNode;
    slot.hasBranch = true; // Strictly limit branching depth to 1
    slot.age = 0;
    slot.stateTime = 0;
    slot.growth = 0.06;
    slot.tension = 0;
    slot.opacity = 1;
    slot.tipFadeAlpha = 0;

    slot.rootU = parent.px[attachNode];
    slot.rootV = parent.py[attachNode];

    // Asymmetric biological branch direction angled off parent tangent
    const pDx = parent.px[attachNode + 1] - parent.px[attachNode - 1];
    const pDy = (parent.py[attachNode + 1] - parent.py[attachNode - 1]) * invAspect;
    const pAng = Math.atan2(pDy, pDx);
    const side = (r2 > 0.5 ? 1 : -1) * parent.bendDir;
    const branchAng = pAng + side * (0.58 + r3 * 0.45);
    slot.rootNx = Math.cos(branchAng);
    slot.rootNy = Math.sin(branchAng) * aspectRatio;

    slot.baseWidth = parent.baseWidth * (0.46 + r1 * 0.18);
    slot.rootFlare = slot.baseWidth * 1.75;
    slot.restLen = parent.restLen * (0.42 + r2 * 0.22);
    slot.maxExtension = slot.restLen * 1.95;
    slot.growDuration = 0.22 + r3 * 0.14;
    slot.bendDir = side;
    slot.bendAmp = 0.018 + r2 * 0.022;
    slot.waveFreq = 2.8 + r1 * 2.2;
    slot.wavePhase = r3 * Math.PI * 2;
    slot.stiffness = 195 + r2 * 35;
    slot.damping = 2 * Math.sqrt(slot.stiffness) * (reduceMotion ? 0.88 : 0.60);
    slot.curlSign = side;

    // Secondary branch reaches organically outward along its asymmetric fork vector
    const reachDist = slot.restLen * (0.85 + r1 * 0.45);
    slot.tipOffU = Math.cos(branchAng) * reachDist;
    slot.tipOffV = Math.sin(branchAng) * reachDist * aspectRatio;

    initChainAtRoot(slot, slot.rootU, slot.rootV);
    return true;
  }

  function triggerSnap(t, cursorDu, cursorDv) {
    t.state = TENDRIL_STATE.SNAPPING;
    t.stateTime = 0;
    totalSnaps++;

    // Capture severed tip filament (nodes 5 -> 7) to fade cleanly without abrupt disappearance
    const breakIdx = 5;
    t.tipFadeAlpha = 1;
    t.tipFadeU0 = t.px[breakIdx];
    t.tipFadeV0 = t.py[breakIdx];
    t.tipFadeU1 = t.px[SEG_COUNT - 1];
    t.tipFadeV1 = t.py[SEG_COUNT - 1];
    t.tipFadeVu = cursorDu * 0.16;
    t.tipFadeVv = cursorDv * 0.16;
    t.tipFadeWidth = Math.max(0.0018, t.widths[breakIdx]);

    // Pull active tip back to the break point and inject controlled elastic whipback impulse
    const bx = t.px[breakIdx];
    const by = t.py[breakIdx];
    const rx = t.rootU - bx;
    const ry = t.rootV - by;
    const rLen = Math.hypot(rx, ry) || 1;
    const nx = rx / rLen;
    const ny = ry / rLen;
    // Perpendicular elastic curl kick so recoil whips organically rather than straight back
    const px = -ny * t.curlSign;
    const py = nx * t.curlSign;

    const whip = 0.85 + t.arcLen * 2.4;
    for (let k = breakIdx; k < SEG_COUNT; k++) {
      const f = (k - breakIdx) / (SEG_COUNT - 1 - breakIdx);
      t.px[k] = bx + (t.px[k] - bx) * 0.25;
      t.py[k] = by + (t.py[k] - by) * 0.25;
      t.vx[k] = nx * whip * (0.8 + 0.5 * f) + px * whip * 0.34 * f;
      t.vy[k] = ny * whip * (0.8 + 0.5 * f) + py * whip * 0.34 * f;
    }

    // Any secondary branch attached to this parent retracts cleanly too
    for (let j = MAX_PRIMARY; j < MAX_TENDRILS; j++) {
      const child = pool[j];
      if (child.parentId === t.id && child.state !== TENDRIL_STATE.DORMANT) {
        child.state = TENDRIL_STATE.RECOILING;
        child.stateTime = 0;
      }
    }
  }

  function startRecoil(t) {
    if (t.state === TENDRIL_STATE.RECOILING || t.state === TENDRIL_STATE.DORMANT) return;
    t.state = TENDRIL_STATE.RECOILING;
    t.stateTime = 0;

    // Give a gentle elastic pull-back kick toward root
    const tipX = t.px[SEG_COUNT - 1];
    const tipY = t.py[SEG_COUNT - 1];
    const dx = t.rootU - tipX;
    const dy = t.rootV - tipY;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const px = -ny * t.curlSign;
    const py = nx * t.curlSign;

    for (let k = 2; k < SEG_COUNT; k++) {
      const f = k / (SEG_COUNT - 1);
      t.vx[k] += (nx * 0.42 + px * 0.18) * f;
      t.vy[k] += (ny * 0.42 + py * 0.18) * f;
    }

    // Retract any attached secondary branch cleanly so nothing is orphaned
    if (t.depth === 0) {
      for (let j = MAX_PRIMARY; j < MAX_TENDRILS; j++) {
        const child = pool[j];
        if (child.parentId === t.id && child.state !== TENDRIL_STATE.DORMANT) {
          child.state = TENDRIL_STATE.RECOILING;
          child.stateTime = 0;
        }
      }
    }
  }

  function updateWidths(t) {
    const tension = clamp(t.tension, 0, 1.15);
    const isRecoiling = t.state === TENDRIL_STATE.RECOILING || t.state === TENDRIL_STATE.SNAPPING;
    // Volume-conserving longitudinal thinning under tension; thickens slightly as it recoils
    const volumeThin = 1 / Math.sqrt(1 + tension * 2.85);
    const recoilThicken = isRecoiling ? (1.12 + 0.35 * (1 - clamp(t.arcLen / 0.14, 0, 1))) : 1.0;

    for (let k = 0; k < SEG_COUNT; k++) {
      const s = k / (SEG_COUNT - 1);
      // Wide liquid root flare blending into symbiote body
      const rootMerge = Math.pow(1 - s, 4.2) * t.rootFlare * (1 - 0.22 * tension);
      // Natural mid-strand necking under high stretch tension
      const neckPinch = 1 - tension * 0.56 * Math.sin(s * Math.PI);
      // Taper cleanly to a pointed biological tip
      const tipTaper = Math.pow(1 - s * 0.88, 0.92);
      const body = t.baseWidth * volumeThin * recoilThicken * neckPinch * tipTaper;
      t.widths[k] = Math.max(0.0012, rootMerge * 0.48 + body);
    }
  }

  function step(dt, now, pointerInfo, reduceMotion) {
    const cursorActive = Boolean(pointerInfo.active && pointerInfo.nearPhoto);
    const cursorU = pointerInfo.u;
    const cursorV = pointerInfo.v;
    const cursorDu = pointerInfo.du || 0;
    const cursorDv = pointerInfo.dv || 0;
    const cursorSpeed = Math.hypot(cursorDu, cursorDv * invAspect);

    // Tick cooldowns first
    for (let i = 0; i < MAX_TENDRILS; i++) {
      if (pool[i].cooldown > 0) {
        pool[i].cooldown = Math.max(0, pool[i].cooldown - dt);
      }
    }

    // Staggered organic spawning (never all at once)
    if (cursorActive) {
      spawnTimer -= dt * (1 + clamp(cursorSpeed * 0.9, 0, 1.4));
      if (spawnTimer <= 0) {
        const spawned = trySpawnPrimary(cursorU, cursorV, now, reduceMotion);
        spawnTimer = spawned
          ? (reduceMotion ? 0.26 : 0.11 + nextRand() * 0.11)
          : 0.08;
      }

      branchTimer -= dt;
      if (branchTimer <= 0) {
        trySpawnSecondary(now, reduceMotion);
        branchTimer = reduceMotion ? 0.55 : (0.24 + nextRand() * 0.28);
      }
    }

    const substeps = 2;
    const hdt = dt / substeps;

    // Reset telemetry counters
    stateCounts.dormant = 0;
    stateCounts.growing = 0;
    stateCounts.attached = 0;
    stateCounts.stretching = 0;
    stateCounts.snapping = 0;
    stateCounts.recoiling = 0;
    activeCount = 0;
    primaryActiveCount = 0;
    secondaryActiveCount = 0;

    for (let i = 0; i < MAX_TENDRILS; i++) {
      const t = pool[i];

      // Update fading severed tip stub even after snap
      if (t.tipFadeAlpha > 0) {
        t.tipFadeAlpha = Math.max(0, t.tipFadeAlpha - dt * 3.8);
        t.tipFadeU0 += t.tipFadeVu * dt;
        t.tipFadeV0 += t.tipFadeVv * dt;
        t.tipFadeU1 += t.tipFadeVu * dt * 1.15;
        t.tipFadeV1 += t.tipFadeVv * dt * 1.15;
        t.tipFadeVu *= Math.exp(-6 * dt);
        t.tipFadeVv *= Math.exp(-6 * dt);
      }

      if (t.state === TENDRIL_STATE.DORMANT) {
        stateCounts.dormant++;
        continue;
      }

      t.age += dt;
      t.stateTime += dt;

      // ---- Root Maintenance & Liquid Integration ----
      if (t.depth === 0) {
        // Verify underlying liquid field is still alive; if Living Memory healed, retract safely
        liquidField.sampleFieldAtUV(t.rootU, t.rootV, tmpSample);
        const rootAlive = tmpSample.mask >= 0.22 && tmpSample.field >= 0.22;
        if (!rootAlive && t.state !== TENDRIL_STATE.RECOILING && t.state !== TENDRIL_STATE.SNAPPING) {
          startRecoil(t);
        } else if (
          cursorActive &&
          (t.state === TENDRIL_STATE.ATTACHED || t.state === TENDRIL_STATE.STRETCHING)
        ) {
          // Subtle root blending into activeField so root visually fuses with the liquid body
          liquidField.depositRootInfluence(t.rootU, t.rootV, t.rootFlare * 0.55, 0.45 * dt);
        }
      } else {
        // Secondary branch root stays rigidly anchored to its parent node
        const parent = pool[t.parentId];
        if (!parent || parent.state === TENDRIL_STATE.DORMANT) {
          t.state = TENDRIL_STATE.DORMANT;
          stateCounts.dormant++;
          continue;
        }
        t.rootU = parent.px[t.parentNode];
        t.rootV = parent.py[t.parentNode];
        if (parent.state === TENDRIL_STATE.RECOILING || parent.state === TENDRIL_STATE.SNAPPING) {
          if (t.state !== TENDRIL_STATE.RECOILING) startRecoil(t);
        }
      }

      // Pin node 0 strictly to root
      t.px[0] = t.rootU;
      t.py[0] = t.rootV;
      t.vx[0] = 0;
      t.vy[0] = 0;

      // ---- Determine Tip Target & State Transitions ----
      let goalTipU = t.rootU;
      let goalTipV = t.rootV;
      let tipK = t.stiffness;
      let tipC = t.damping;

      if (t.depth === 0) {
        const rawTargetU = cursorU + t.tipOffU;
        const rawTargetV = cursorV + t.tipOffV;

        if (t.state === TENDRIL_STATE.GROWING) {
          if (!cursorActive) {
            startRecoil(t);
          } else {
            t.growth = Math.min(1, t.growth + dt / t.growDuration);
            const gEase = t.growth * t.growth * (3 - 2 * t.growth);
            goalTipU = t.rootU + (rawTargetU - t.rootU) * gEase;
            goalTipV = t.rootV + (rawTargetV - t.rootV) * gEase;

            const distGoal = uvDist(t.px[SEG_COUNT - 1], t.py[SEG_COUNT - 1], rawTargetU, rawTargetV);
            if (t.growth >= 0.96 || distGoal < 0.032) {
              t.state = TENDRIL_STATE.ATTACHED;
              t.stateTime = 0;
              t.growth = 1;
            }
          }
        }

        if (t.state === TENDRIL_STATE.ATTACHED || t.state === TENDRIL_STATE.STRETCHING) {
          if (!cursorActive) {
            startRecoil(t);
          } else {
            // Elastic resistance near stretch limit subtly pulls tip back toward root
            const resist = clamp((t.tension - 0.55) / 0.45, 0, 1) * 0.14;
            goalTipU = rawTargetU + (t.rootU - rawTargetU) * resist;
            goalTipV = rawTargetV + (t.rootV - rawTargetV) * resist;
            tipK = t.stiffness * (1.15 - resist * 1.4);
            tipC = 2 * Math.sqrt(tipK) * (reduceMotion ? 0.88 : 0.48);
          }
        } else if (t.state === TENDRIL_STATE.SNAPPING) {
          // Brief snap transition beat before elastic recoil takes over
          goalTipU = t.rootU;
          goalTipV = t.rootV;
          tipK = 190;
          tipC = 14;
          if (t.stateTime >= 0.09) {
            t.state = TENDRIL_STATE.RECOILING;
            t.stateTime = 0;
          }
        } else if (t.state === TENDRIL_STATE.RECOILING) {
          goalTipU = t.rootU;
          goalTipV = t.rootV;
          tipK = 225;
          tipC = 2 * Math.sqrt(tipK) * (reduceMotion ? 0.92 : 0.46);
        }
      } else {
        // Secondary branch target follows organic fork vector + gentle cursor sway
        const swayU = cursorActive ? clamp(cursorDu * 0.015, -0.025, 0.025) : 0;
        const swayV = cursorActive ? clamp(cursorDv * 0.015, -0.025, 0.025) : 0;
        if (t.state === TENDRIL_STATE.GROWING) {
          t.growth = Math.min(1, t.growth + dt / t.growDuration);
          const gEase = t.growth * t.growth * (3 - 2 * t.growth);
          goalTipU = t.rootU + (t.tipOffU + swayU) * gEase;
          goalTipV = t.rootV + (t.tipOffV + swayV) * gEase;
          if (t.growth >= 0.98) {
            t.state = TENDRIL_STATE.ATTACHED;
            t.stateTime = 0;
          }
        } else if (t.state === TENDRIL_STATE.ATTACHED || t.state === TENDRIL_STATE.STRETCHING) {
          if (!cursorActive || t.age > 2.6) {
            startRecoil(t);
          } else {
            goalTipU = t.rootU + t.tipOffU + swayU;
            goalTipV = t.rootV + t.tipOffV + swayV;
          }
        } else {
          goalTipU = t.rootU;
          goalTipV = t.rootV;
          tipK = 240;
          tipC = 20;
        }
      }

      // ---- 2-Substep Multi-Node Spring-Chain Integration ----
      const chordU = t.px[SEG_COUNT - 1] - t.rootU;
      const chordV = t.py[SEG_COUNT - 1] - t.rootV;
      const chordLen = Math.hypot(chordU, chordV) || 0.001;
      const perpU = -chordV / chordLen;
      const perpV = chordU / chordLen;

      const isRecoilPhase = t.state === TENDRIL_STATE.RECOILING || t.state === TENDRIL_STATE.SNAPPING;
      const slack = Math.pow(1 - clamp(t.tension, 0, 1), 1.65);

      for (let sub = 0; sub < substeps; sub++) {
        // Tip node (SEG_COUNT - 1) spring toward goalTip
        const tipIdx = SEG_COUNT - 1;
        const axTip = (goalTipU - t.px[tipIdx]) * tipK - t.vx[tipIdx] * tipC;
        const ayTip = (goalTipV - t.py[tipIdx]) * tipK - t.vy[tipIdx] * tipC;
        t.vx[tipIdx] += axTip * hdt;
        t.vy[tipIdx] += ayTip * hdt;
        t.px[tipIdx] += t.vx[tipIdx] * hdt;
        t.py[tipIdx] += t.vy[tipIdx] * hdt;

        // Interior nodes 1..6: neighbor spring tension + organic bend/curl target
        const kNeighbor = isRecoilPhase ? 240 : (165 + t.tension * 110);
        const kGuide = isRecoilPhase ? 38 : (62 + t.tension * 45);
        const cNode = isRecoilPhase ? 13.5 : (reduceMotion ? 22 : 14.5);

        for (let k = 1; k < tipIdx; k++) {
          const s = k / tipIdx;
          const arch = Math.sin(s * Math.PI); // 0 at ends, 1 in middle

          // Organic S-bend + subtle living wave (dampens as tension pulls strand taut)
          const wave = reduceMotion
            ? 0
            : Math.sin(now * t.waveFreq + s * 4.5 + t.wavePhase) * 0.011 * slack;
          const curlOffset = isRecoilPhase
            ? (t.curlSign * 0.028 * arch * clamp(chordLen / 0.14, 0, 1))
            : ((t.bendDir * t.bendAmp * (0.45 + 0.55 * slack) + wave) * arch);

          // Emerge smoothly along root normal near base
          const rootPush = Math.pow(1 - s, 2) * 0.022 * (1 - 0.55 * clamp(t.tension, 0, 1));
          const guideU = t.rootU + chordU * s + perpU * curlOffset + t.rootNx * rootPush;
          const guideV = t.rootV + chordV * s + perpV * curlOffset + t.rootNy * rootPush;

          // Neighbor midpoint pulls chain smoothly without polygonal kinks
          const midU = (t.px[k - 1] + t.px[k + 1]) * 0.5;
          const midV = (t.py[k - 1] + t.py[k + 1]) * 0.5;

          const fx = (midU - t.px[k]) * kNeighbor + (guideU - t.px[k]) * kGuide - t.vx[k] * cNode;
          const fy = (midV - t.py[k]) * kNeighbor + (guideV - t.py[k]) * kGuide - t.vy[k] * cNode;

          t.vx[k] += fx * hdt;
          t.vy[k] += fy * hdt;
          t.px[k] += t.vx[k] * hdt;
          t.py[k] += t.vy[k] * hdt;
        }
      }

      // ---- Compute Arc Length, Tension & Check Stretching / Snapping / Recoil Completion ----
      let arc = 0;
      for (let k = 0; k < SEG_COUNT - 1; k++) {
        arc += uvDist(t.px[k], t.py[k], t.px[k + 1], t.py[k + 1]);
      }
      t.arcLen = arc;

      if (t.depth === 0 && (t.state === TENDRIL_STATE.ATTACHED || t.state === TENDRIL_STATE.STRETCHING)) {
        // Fast cursor flick slightly lowers effective break threshold for natural viscoelastic snap
        const flickScale = clamp(1 - cursorSpeed * 0.08, 0.78, 1.0);
        const effMax = t.maxExtension * flickScale;
        t.tension = clamp((arc - t.restLen) / Math.max(0.05, effMax - t.restLen), 0, 1.25);

        if (t.state === TENDRIL_STATE.ATTACHED && t.tension > 0.32) {
          t.state = TENDRIL_STATE.STRETCHING;
          t.stateTime = 0;
        } else if (t.state === TENDRIL_STATE.STRETCHING && t.tension < 0.24) {
          t.state = TENDRIL_STATE.ATTACHED;
          t.stateTime = 0;
        }

        // Occasional purposeful snap when individual tension limit is exceeded
        if (arc > effMax) {
          triggerSnap(t, cursorDu, cursorDv);
        }
      } else if (t.state === TENDRIL_STATE.RECOILING) {
        t.tension = Math.max(0, t.tension - dt * 2.8);
        t.opacity = clamp(arc / 0.035, 0, 1);

        // Return slot cleanly to dormant pool once retracted back into root
        if (arc < 0.014 || t.stateTime > 0.85) {
          t.state = TENDRIL_STATE.DORMANT;
          t.opacity = 0;
          t.cooldown = 0.40 + nextRand() * 0.55;
          if (t.depth === 1 && t.parentId >= 0) {
            pool[t.parentId].hasBranch = false;
            t.parentId = -1;
          }
          stateCounts.dormant++;
          continue;
        }
      } else {
        t.tension = Math.max(0, t.tension - dt * 2.0);
        t.opacity = 1;
      }

      updateWidths(t);

      // Update live counts
      activeCount++;
      if (t.depth === 0) primaryActiveCount++;
      else secondaryActiveCount++;
      stateCounts[STATE_NAMES[t.state]]++;
    }

    return activeCount > 0;
  }

  function reset() {
    for (let i = 0; i < MAX_TENDRILS; i++) {
      const t = pool[i];
      t.state = TENDRIL_STATE.DORMANT;
      t.parentId = -1;
      t.hasBranch = false;
      t.cooldown = 0;
      t.tension = 0;
      t.arcLen = 0;
      t.opacity = 0;
      t.tipFadeAlpha = 0;
    }
    activeCount = 0;
    primaryActiveCount = 0;
    secondaryActiveCount = 0;
    stateCounts.dormant = MAX_TENDRILS;
    stateCounts.growing = 0;
    stateCounts.attached = 0;
    stateCounts.stretching = 0;
    stateCounts.snapping = 0;
    stateCounts.recoiling = 0;
  }

  function hasVisualContent() {
    if (activeCount > 0) return true;
    for (let i = 0; i < MAX_TENDRILS; i++) {
      if (pool[i].tipFadeAlpha > 0.01) return true;
    }
    return false;
  }

  return {
    pool,
    SEG_COUNT,
    step,
    reset,
    isActive: hasVisualContent,
    getStats: () => ({
      activeTotal: activeCount,
      primaryActive: primaryActiveCount,
      secondaryActive: secondaryActiveCount,
      totalSnaps,
      states: { ...stateCounts }
    })
  };
}
