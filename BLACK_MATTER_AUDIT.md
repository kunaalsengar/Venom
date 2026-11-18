# BLACK MATTER / LIVING STICKY SUBSTANCE — TECHNICAL AUDIT REPORT

**Audited Source File:** `let's collaborate (black tendrils).html` (212 lines, 11,284 bytes)  
**Audit Mode:** Read-only technical audit (no source files modified, no dependencies installed)  
**Baseline Preservation:** All existing animation code and behavior in `let's collaborate (black tendrils).html` remain intact as the baseline.

> **Convention used throughout this report:**  
> - **`[EXISTING]`** denotes behavior, symbols, and code currently present in `let's collaborate (black tendrils).html` (with exact line references).  
> - **`[PROPOSED]`** denotes recommended future architecture, functions, or changes not yet implemented.

---

## 1. Project Architecture `[EXISTING]`

The project is currently a **single standalone HTML file** with inline CSS and vanilla JavaScript, zero JS dependencies, and one external stylesheet dependency (Google Fonts `Inter:wght@700`).

### File & Runtime Topology

```text
let's collaborate (black tendrils).html
├── <head> (L1–L19)
│   ├── Viewport meta with viewport-fit=cover (L5)
│   ├── External Google Font: Inter weight 700 (L7)
│   └── Inline CSS: warm off-white radial gradient background, fixed canvas, #hint overlay (L8–L18)
├── <body> (L20–L22)
│   ├── <canvas id="c"> — full-viewport immediate-mode 2D rendering surface (L21)
│   └── <div id="hint"> — "Bring your cursor close." bottom prompt (L22)
└── <script> (L23–L210)
    ├── Setup & Resize: ctx, reduced-motion check, DPR scaling, font load (L24–L33)
    ├── Math & Path Helpers: clamp(), sstep(), rr() (L35–L41)
    ├── State & Input Listeners: pill P, engagement e/engaged, cursor C, pointermove/pointerdown (L44–L51)
    ├── Strand Pool: M = 18 randomized strand descriptors S[] (L53–L60)
    ├── Renderers: pillDims() (L62–L64), drawPill() (L66–L109), drawHand() (L111–L121), drawArrow() (L122–L128)
    └── Main Loop: frame() via requestAnimationFrame (L130–L209)
```

### Rendering Order (Painter's Algorithm in `frame()`, L171–L206)

1. Full canvas clear (`ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H)`, L134).
2. **Layer 1 — Strands (`S[0..17]`, L171–L202):** 18 segmented quadratic Bézier curves stroked in `rgba(8,8,10,0.93)` behind the pill.
3. **Layer 2 — Main Pill (`drawPill`, L204):** Rigid rounded-rectangle CTA labeled `"let’s collaborate"` with layered 2D gradients, clipped highlight ellipses, rim strokes, and a blurred drop shadow. Because it renders *after* the strands, it visually masks the strand roots.
4. **Layer 3 — Custom Cursor (`drawArrow` & `drawHand`, L205–L206):** Cross-faded canvas-drawn arrow and cartoon glove hand replacing the hidden native OS cursor (`cursor: none`, L12).

---

## 2. Existing Functionality (System-by-System Audit) `[EXISTING]`

### 2.1 Rendering Architecture
- Uses immediate-mode **HTML Canvas 2D** (`cv.getContext('2d')`, L24).
- The "black glossy material" is currently a **rigid stadium/pill geometry** drawn with the rounded-rectangle path helper `rr(x, y, w, h, r)` (L37–L41), not a deformable liquid mesh or metaball field.
- Glossiness on the pill is simulated inside `drawPill()` (L66–L109) via 7 stacked `CanvasLinearGradient` passes:
  - Base obsidian body gradient (`g`, L71–L74) with purple-tinted drop shadow (`rgba(70,60,125,0.38)`, `shadowBlur = 38 * dpr`, `shadowOffsetY = 24 * dpr`, L70).
  - Clipped interior reflections (L77–L95): cool blue left rim (`g2`), top elliptical softbox highlight (`g3`), rotated upper-right specular highlight (`g4`), horizontal velocity-shifted specular band (`g5`, shifted by `P.vx * 0.0006`, L88–L91), and bottom inner rim stroke (`g6`).
  - Outer top-lit specular border stroke (`g7`, L96–L98).
  - Gradient-filled `"let’s collaborate"` label with subtle text shadow (`gt`, L100–L107).

### 2.2 Canvas Rendering & Animation Loop
- Unconditional `requestAnimationFrame(frame)` loop (L131–L209).
- Time step computed via `performance.now() / 1000` with upper clamp `dt = Math.min(now - prev, 1 / 30)` (L132–L133). This prevents physics explosion after tab-switching, at the cost of running in slow motion below 30 FPS.
- Loop never sleeps when the scene is static or off-screen, and holds no RAF ID for teardown.

### 2.3 Cursor Tracking Implementation
- Global `pointermove` (L47–L50) and `pointerdown` (L51) listeners write `ev.clientX` / `ev.clientY` to `C = { x, y }`, set `hasMouse = true`, and record `lastMove = performance.now() / 1000`.
- On the first `pointermove`, `started` becomes `true` and `#hint` receives class `.off` (`opacity: 0`).
- **Auto-demo / Ghost Cursor (L140–L144):** Before any pointer input (`!hasMouse`) or after 7 seconds of pointer inactivity (`now - lastMove > 7`), `C` is driven automatically along a Lissajous curve:
  - `C.x = W * 0.5 + Math.cos(t * 0.55) * W * 0.3`
  - `C.y = H * 0.62 + Math.sin(t * 0.8) * H * 0.2`
  - where `t = now - 1.0`. During the first 1 second after page navigation (`t <= 0`), the ghost cursor rests at `(W * 0.9, H * 0.55)`.
- Native cursor is hidden via `canvas { cursor: none; }` (L12) and replaced by `drawArrow` (fading out across `e ∈ [0.25, 0.55]`) and `drawHand` (fading in across `e ∈ [0.5, 0.85]`).

### 2.4 Proximity Detection & Activation Thresholds
- Computes Euclidean distance from cursor `C` to pill **center** `P`: `d = Math.hypot(C.x - P.x, C.y - P.y)` (L145).
- Hysteresis thresholds (L146–L148):
  - Activation threshold: `Rin = Math.max(320, w * 1.5)` → evaluates to `345px–600px` (since `w ∈ [230, 400]`, `w * 1.5` is always `≥ 345`, making `320` unreachable dead code).
  - Deactivation threshold: `Rout = Rin * 1.7` → evaluates to `586.5px–1020px`.
- Binary flag `engaged` drives a continuous smoothing scalar `e ∈ [0, 1]` using frame-rate-independent exponential smoothing (L149):
  - `e += ((engaged ? 1 : 0) - e) * (1 - Math.exp(-(engaged ? 5 : 3) * dt))`
  - Faster attack (`rate = 5`, ~95% in `0.6s`) than release (`rate = 3`, ~95% in `1.0s`).

### 2.5 Spring Physics & Movement Calculations
- **Pill Body Translation (L152–L157):**
  - Target hangs above the cursor by `offY = h * 0.5 * sc + 150 * sc0`, clamped inside viewport margins (`gx ∈ [0.5w, W - 0.5w]`, `gy ∈ [0.8h, H - h]`), then blended 90% from `home = (W/2, 0.46H)` toward `(gx, gy)` weighted by `e`.
  - Integrated via semi-implicit Euler with stiffness `k = 16` ($\omega_0 = 4\text{ rad/s}$) and damping `c = 6.5` (damping ratio $\zeta = 6.5 / 8 = 0.8125$, mildly underdamped).
- **Pill Rotation & Scale (L152, L158):**
  - Uniform scale: `sc = 1 + 0.1 * e` (no squash/stretch or directional deformation).
  - Instantaneous (non-spring) tilt angle: `ang = -0.1 + clamp((C.x - P.x)/W * 0.4, -0.22, 0.22) * e + clamp(P.vx * 0.0003, -0.1, 0.1)`. Resting angle is `-0.1 rad` (`-5.7°`).
- **Per-Strand Dual-Spring System (L169, L183–L189):**
  - Runs `sub = 2` semi-implicit Euler substeps per frame (`hdt = dt / 2 <= 1/60 s`).
  - **Tip spring `(s.tx, s.ty)`** chases cursor offset `(ttx, tty)`: stiffness `kc = s.kt ∈ [55, 100]` ($\omega_0 ∈ [7.42, 10]\text{ rad/s}$), damping ratio $\zeta = 0.34$ (noticeably bouncy) or `0.9` if `prefers-reduced-motion` is enabled.
  - **Control-point spring `(s.cx, s.cy)`** chases chord midpoint + perpendicular sine wobble + downward gravity sag `(ctx_, cty_)`: stiffness `38` ($\omega_0 \approx 6.16$), damping `7` ($\zeta \approx 0.568$).

### 2.6 Sticky Strand Generation
- Fixed pool `M = 18` initialized once at startup (L53–L60) with randomized angle `a`, cursor-offset radius `rad ∈ [0, 14)`, extension `delay ∈ [0, 0.45)`, tangent spread `tOff` (roughly `±37px`), phase `ph`, frequency `f ∈ [1.4, 3.6]`, lateral `bend ∈ [-1, 1]`, gravity `sag ∈ [0.5, 1.5]`, base width `w ∈ [1.5, 3.1]`, and tip stiffness `kt ∈ [55, 100]`.
- **Root Anchor Projection (L161–L167, L172–L173):**
  - Rotates pill-to-cursor unit vector `(ux, uy)` into pill local space `(lx, ly)` by `-ang`.
  - Projects onto an $L^4$ superellipse `( |lx/hw|^4 + |ly/hh|^4 )^(1/4)` scaled inward by `0.92`, then offsets linearly along tangent `(-ly, lx)` by `s.tOff * sc0`, and rotates back to world space `(Ax, Ay)`.
- **Curve Rendering (L177–L201):**
  - Rendered endpoint `(ex, ey)` blends linearly from `(Ax, Ay)` to `(s.tx, s.ty)` via `ext = sstep(s.delay, s.delay + 0.55, e)`.
  - Sampled along a quadratic Bézier curve `(Ax, Ay) → (s.cx, s.cy) → (ex, ey)` in `NS = 20` straight segments, perturbed perpendicular to the chord by a travelling sine wave (`rp = sin(t*9 - now*7 + s.ph) * 2.6 * e * t * u * 4`, L197).

### 2.7 Elasticity & Deformation Calculations
- **Thickness Profile (L198):** `lineWidth = Math.max(0.7, s.w * (1 - 0.62 * t)) * (0.75 + 0.25 * sc0)`.
  - Tapers **statically and linearly** from `100%` at the pill anchor (`t = 0`) to `38%` at the cursor tip (`t = 1`).
  - Completely independent of strand length `L` or tension; there is no hourglass/capillary necking in the middle (`t ≈ 0.5`).
- **Surface Deformation:** None. The pill boundary does not pull, bulge, or form liquid fillets where strands attach.

### 2.8 Release & Recovery Behavior
- No individual strand breaking or tension limit exists.
- Release occurs only globally when `d > Rout`, setting `engaged = false` and exponentially decaying `e → 0`.
- Strands retract linearly toward their pill anchors in reverse `delay` order via `ext = sstep(...)` and stop drawing when `ext < 0.02` (L190).
- Pill glides back to `home = (W/2, 0.46H)` via its spring.

### 2.9 Responsive Behavior
- `resize()` (L28–L32) updates `W = innerWidth`, `H = innerHeight`, caps `dpr = Math.min(devicePixelRatio || 1, 2)`, and resizes the canvas backing store.
- Pill scales fluidly with viewport width: `w = clamp(W * 0.36, 230, 400); h = w * 0.36` (L63), with proportional scale ratio `sc0 = w / 300 ∈ [0.767, 1.333]`.
- `#hint` respects bottom safe area via `env(safe-area-inset-bottom, 0px)` (L14); canvas sets `touch-action: none` (L12) to prevent touch-scroll interference.

### 2.10 Performance & Memory Profile
- Fixed-size data structures (`M = 18` objects) prevent unbounded heap leaks during normal runtime.
- However, per-frame GPU/CPU work is unoptimized for Canvas 2D: up to 360 stroked micro-segments/frame, 8 `CanvasGradient` allocations/frame, per-frame clipping, and a large `38 * dpr` Gaussian `shadowBlur`. (Detailed breakdown in Section 4.)

---

## 3. Bugs, Technical Problems & Limitations `[EXISTING]`

| Severity | Category | Location | Technical Details |
| :--- | :--- | :--- | :--- |
| **Critical** | **Un-escapable Disengagement Trap** | L146–L156 | `Rout = Rin * 1.7` produces `586.5px` (mobile) to `1020px` (desktop). Because the pill chases the cursor at distance `~offY` (`150–265px`), `d` remains far below `Rout`. On phones, tablets, and many laptop screens, **once engaged, the user cannot escape or release the substance**. |
| **High** | **Touch & Mobile Interaction Bugs** | L12, L47–L51, L205–L206 | 1) `pointerdown` (L51) does not set `started = true` or fade `#hint`, so tapping without dragging leaves `"Bring your cursor close."` visible indefinitely.<br>2) No `pointerup` / `pointercancel` / `pointerleave` handlers: after lifting a finger (or leaving the browser window), the phantom cursor stays stuck for 7 seconds before jumping into demo mode.<br>3) `drawArrow` and `drawHand` render a fake desktop cursor directly underneath a touch user's finger.<br>4) No `ev.isPrimary` filtering: multi-touch jumps `C` erratically between fingers. |
| **High** | **Reduced-Motion Violation** | L26, L140–L144, L156, L181, L184, L197 | `prefers-reduced-motion: reduce` is read only once at startup (no `change` listener). Even when active, the ghost cursor still orbits continuously, the pill still bounces and chases, and tendrils still shoot out—only sine wobble, ripple, and tip bounce are reduced. |
| **High** | **Semi-Transparent Round-Cap Beading Artifact** | L170, L193–L200 | Each strand draws 20 disconnected `beginPath()/stroke()` segments using translucent `rgba(8,8,10,0.93)` with `lineCap = 'round'`. Overlapping semicircular endcaps double-blend alpha at every segment joint, creating visible dark dots/beads along thin strands while costing 360 draw calls/frame. |
| **Medium** | **Ghost Cursor Teleport Jump** | L140–L144 | When idle timeout triggers (`now - lastMove > 7`), `C` snaps instantaneously from the user's last pointer position to `cos((now - 1) * 0.55)` on the Lissajous path, causing a violent spring whip in the pill and all 18 strands. |
| **Medium** | **Superellipse / Capsule Anchor Mismatch** | L164–L166, L172 | The pill is a stadium/capsule (`rr` with radius `hh`), but strand anchors are projected onto an $L^4$ superellipse and shifted linearly along the tangent (`tOff * sc0`, up to `±49px`). When the cursor is horizontally aligned with the narrow rounded ends, outer strand anchors overshoot outside the pill's curved endcap. |
| **Medium** | **Hidden Physics Waste & Re-engagement Snap** | L183–L190 | When `ext < 0.02` (strands invisible/disengaged), the spring loop still executes 2 substeps per strand chasing `C` every frame. Consequently, `s.tx/s.ty` are already hovering on the cursor before re-engagement rather than physically extending from the pill. |
| **Medium** | **Clamp Inversion on Small Viewports** | L35, L63, L154 | On narrow (`W < 230px`) or short landscape (`H < 1.8 * h`, e.g. `~150–260px`) viewports/embeds, `min > max` inside `clamp(v, min, max)`. `Math.max(a, Math.min(b, v))` always returns `a`, pinning the pill off-bounds. |
| **Medium** | **Accessibility & Dead CTA Semantics** | L12, L21, L107 | Visually presents an interactive `"let’s collaborate"` button, yet there is no `<button>` element, no keyboard focus/Enter/Space activation, no ARIA label, no click action, and `cursor: none` hides the user's system cursor. |
| **Low** | **Font Weight Mismatch & External Dependency** | L7, L15, L33 | Requests only `Inter:wght@700` from Google Fonts, while `#hint` specifies `font-weight: 500` (causing fallback/faux weight). Offline environments or strict CSPs fail to load `Inter`, and `document.fonts.load` can cause a canvas text reflow pop (FOUT) on initial frames. |
| **Low** | **Resize / DPR & Lifecycle Cleanup** | L28–L32, L47–L51, L207 | No listener for DPR changes when dragging between 1× and 2× displays, no `visualViewport` handling for mobile browser chrome, and no cleanup/disposal hook for global event listeners or `requestAnimationFrame` if integrated into a larger app. |
| **Low** | **Shadow Scaling & Browser Compatibility** | L70, L102, L116 | `shadowBlur = 38 * dpr` and `shadowOffsetY = 24 * dpr` are not scaled by `sc0` or `sc`, making the shadow disproportionately large on mobile. `ctx.letterSpacing` (L102) is unsupported in older Safari/WebKit versions, widening canvas text. `drawHand` (L116–L117) shadows parameter `a` with callback argument `a`. `Math.max(320, w * 1.5)` (L146) contains dead branch `320`. |

---

## 4. Performance Analysis `[EXISTING]`

### Per-Frame Workload Breakdown (at 60 FPS, Retina `dpr = 2`)

| Operation | Frequency / Frame | Cost Profile | Notes |
| :--- | :--- | :--- | :--- |
| **Pill Drop Shadow (`shadowBlur = 38 * dpr`)** | 1× (up to `76px` blur radius) | **Very High (GPU/CPU)** | Largest single bottleneck in Canvas 2D, especially on Safari/iOS and Firefox. Redrawn from scratch every frame even though the pill shape is rigid and unchanging. |
| **Strand Strokes (`beginPath` + `stroke`)** | Up to **360 draw calls** (`18 × 20`) | **High (CPU/Driver)** | Each segment computes round caps and tessellates separately. Replacing with 18 filled variable-width ribbon polygons reduces draw calls by **20×** (360 → 18) and eliminates alpha-overlap beading. |
| **Canvas Clip Mask (`ctx.clip()`)** | 1× per frame | **Medium (GPU)** | Stencil/mask setup on every frame for static interior reflections on the pill. |
| **Gradient Allocations (`createLinearGradient`)** | **8 allocations / frame** (`480/sec`) | **Low–Medium (GC/API)** | 7 of the 8 pill gradients (`g, g2, g3, g4, g6, g7, gt`) are completely static for a given `(w, h)` and never need per-frame recreation. |
| **Strand Spring Physics** | 18 × 2 substeps = 72 2D updates | **Negligible (<0.1ms)** | Lightweight arithmetic; safe to scale to multi-node Verlet chains (e.g., 24 strands × 5 nodes). |
| **Per-Frame JS Allocations** | `shapes` array + 2 closures in `drawHand`, `{w,h}`, `{x,y}` | **Negligible** | Easy to hoist out of hot loop for cleaner GC hygiene. |

### Physics Stability Assessment
- **Pill spring:** $\omega_0 = \sqrt{16} = 4\text{ rad/s}$, $\zeta = 0.8125$, $\Delta t_{\max} = 1/30\text{s} \Rightarrow \omega_0 \Delta t_{\max} = 0.133$. Well inside the semi-implicit Euler stability limit ($\omega_0 \Delta t < 2$).
- **Strand tip springs:** $\omega_0 \le \sqrt{100} = 10\text{ rad/s}$, $\zeta = 0.34$, $hdt_{\max} = 1/60\text{s} \Rightarrow \omega_0 hdt_{\max} = 0.167$. Stable at current stiffness, though raising stiffness `kc > 400` or removing the `1/30` `dt` clamp would destabilize it.
- **No idle throttling:** Runs continuously at 60–120 FPS even when stationary or scrolled out of view.

---

## 5. Visual & Interaction Audit (Missing Features Matrix)

Comparison of `[EXISTING]` behavior against the 12 target experience requirements:

| # | Target Experience Requirement | Status | What Already Works `[EXISTING]` | What Is Missing / Needs Upgrade `[PROPOSED]` |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Black glossy living material** | **Partially Works** | Glossy dark pill with layered gradients, moving specular band (`g5`), and soft purple drop shadow. | Pill is completely rigid; strands are flat matte dark lines (`rgba(8,8,10,0.93)`) with zero gloss, volume, or surface light response. |
| 2 | **Organic liquid surface** | **Missing** | Clean pill silhouette only. | No fluid breathing/undulation, no localized surface bulging toward cursor, no glossy metaball/meniscus deformation. |
| 3 | **Cursor proximity detection** | **Partially Works** | Hysteresis thresholds (`Rin`, `Rout`) and smooth engagement ramp `e`. | Distance measured from pill center instead of pill boundary; `Rout` traps user on most viewports; no multi-zone anticipation vs. contact detection. |
| 4 | **Material reaches towards cursor** | **Partially Works** | Pill leans/moves toward cursor; 18 staggered strands extend along `ext`. | Main liquid body does not deform/reach out with organic pseudopods before contact; strands emerge as flat lines from behind the pill. |
| 5 | **Substance catches & attaches to cursor** | **Partially Works** | Tips spring toward offsets around `C`; cursor cross-fades from arrow to hand. | No genuine latch/catch event, no adhesive wet cap/meniscus wrapping around the cursor, no tactile pull/resistance feel. |
| 6 | **Multiple sticky strands** | **Partially Works** | 18 distinct strands with varied timing, offset, sag, bend, width, and stiffness. | Strands look like uniform flat strings with round-cap overlap dots rather than glossy, coalescing liquid bridges of varying thickness. |
| 7 | **Elastic stretching while moving cursor** | **Partially Works** | Spring lag on tips and control points creates rubbery follow-through and sag. | Pill follows too closely to build real tension; strands keep sagging/wobbling instead of pulling taut under strain; no local pull force on the pill edge. |
| 8 | **Natural strand thinning** | **Missing** | Static linear root-to-tip taper (`1 - 0.62 * t`) only. | No tension/length-based volume conservation ($r_{\text{mid}} \propto 1/\sqrt{L}$) and wrong profile (real liquid bridges are thick at *both* ends and pinch thinnest in the center). |
| 9 | **Strand breaking at maximum tension** | **Missing** | Global disengagement retract only (`d > Rout`). | No per-strand break threshold, no progressive pinch/necking before rupture, no staggered one-by-one snapping. |
| 10 | **Liquid recoil and self-healing** | **Missing** | Smooth `ext` linear shrink back into pill. | No snapped-strand whipback physics, no cursor-side residue droplets, no reabsorption splash/ripple on the main body, no refractory healing delay. |
| 11 | **Seamless merging with main substance** | **Missing** | Strands are merely hidden behind `drawPill()`. | Pill's crisp white rim stroke (`g7`) slices across every strand root; no smooth-minimum (`smin`) / metaball fillet union between strands and body. |
| 12 | **Smooth 60 FPS animation** | **Partially Works** | Hits 60 FPS on modern desktops with `dt` cap and `dpr <= 2`. | Heavy per-frame `shadowBlur`, `clip()`, 8 gradient allocations, and 360 segment strokes risk drops on high-DPR mobile/Safari and 120Hz displays. |

---

## 6. Recommended Technology & Architecture Evaluation `[PROPOSED]`

### Technology Comparison Matrix

| Technology | Glossy Liquid Quality | Seamless Merging | 60 FPS Mobile Perf | Complexity | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **HTML Canvas 2D (Pure)** | Medium (fake 2D gradients; flat strands) | Poor–Medium (blur+threshold filter is slow/blurry in Safari; manual fillets lack 3D gloss) | Good (once optimized) | Low | **Keep as P0 stabilization & no-WebGL fallback only.** |
| **SVG Paths + Gooey Filter** | Low–Medium (flat fills; filter halo artifacts) | Medium (`feGaussianBlur` + `feColorMatrix`) | **Poor** (DOM + SVG filter rasterization chokes mobile/Safari on 18+ animated paths) | Medium | **Not recommended.** |
| **WebGL2 + 2.5D SDF Liquid Shader** | **Excellent** (true surface normals, Fresnel rim, glossy clearcoat highlights on body *and* 1px strands) | **Excellent** (exact analytical polynomial `smin` fusion between pill, bulges, strands, and droplets) | **Excellent** (1 fullscreen quad draw call; 60–120 FPS) | Medium | **RECOMMENDED PRIMARY ENGINE.** |
| **Three.js** | **Excellent** (same SDF shader or full 3D raymarching/PBR env maps) | **Excellent** (via custom `ShaderMaterial`; 3D Marching Cubes aliases on thin 1–2px strands) | Good–Excellent (adds ~160 KB gzipped bundle & startup overhead) | Medium–High | **Optional wrapper only if site already uses Three.js or needs a full 3D camera scene.** |
| **Shader-Based Liquid Deformation (SDF)** | **Excellent** | **Excellent** | **Excellent** | Medium | **Core rendering technique inside WebGL2.** |
| **Metaballs / Full Grid Fluid Sim (Navier-Stokes)** | Medium–High | Excellent | Poor–Medium for thin sticky filaments | Very High | **Grid fluid sim is wrong physical regime** (too chaotic, loses crisp snapping strands); **SDF metaball primitives + JS spring/Verlet filaments** give exact artistic control. |

### Recommended Architecture: Hybrid JS Physics + WebGL2 2.5D SDF Liquid Shader + Accessible HTML Overlay

Rather than discarding the working simulation or adding heavy frameworks, evolve the current architecture into **three clean, decoupled layers**:

1. **Simulation Layer (Vanilla JS — Evolved from Existing Code `[EXISTING → UPGRADED]`):**
   - Preserve the clean, readable JS physics architecture (`P`, `S[]`, semi-implicit Euler / Verlet integration) and upgrade it with:
     - Exact pill capsule boundary distance & surface anchor projection.
     - Multi-node strand chains (3–5 Verlet/spring nodes per strand) with volume-conserving necking profiles.
     - Per-strand finite state machine: `IDLE → REACHING → ATTACHED → STRETCHING → NECKING → BROKEN/RECOILING → HEALING`.
     - Lightweight droplet pool for snapped cursor-side residue.
2. **Rendering Layer (Zero-Dependency WebGL2 Fullscreen 2.5D SDF Shader `[PROPOSED]`):**
   - Uploads pill state, surface bulge probes, strand capsule/Bézier segments (with per-node radius), and droplets via a compact uniform buffer or `RGBA32F` data texture (~1 KB/frame).
   - Evaluates a single **2.5D Signed Distance Field**:
     - Rounded-box (stadium) pill SDF with subtle animated organic noise & pull bulges.
     - Variable-radius tapered capsule / quadratic Bézier SDFs for every active strand and recoiling stub.
     - Sphere SDFs for breaking droplets and cursor-attachment menisci.
     - Fuses all primitives with **polynomial smooth-minimum (`smin`)**, producing true wet menisci/fillets where strands emerge seamlessly from the pill and coalesce with neighboring strands!
   - Derives a smooth 3D pillowed heightfield $z(d)$ and surface normal $\vec{n} = \text{normalize}(\nabla_{\text{SDF}}, z')$ directly from the SDF, enabling **real-time glossy black liquid shading** across the entire connected surface (body + roots + thin strands + droplets):
     - Deep obsidian base (`#040406`)
     - Dual-lobe studio softbox specular reflection (sharp wet clearcoat + broad metallic sheen)
     - Cool slate-blue/violet Fresnel rim light matching the current pill aesthetic
     - Analytic soft ground drop shadow underneath the entire fused liquid mass
   - Keeps an **optimized Canvas 2D fallback renderer** automatically when WebGL2 is unavailable or context is lost.
3. **Interactive UI & Accessibility Layer (HTML `<button>` + Crisp Text `[PROPOSED]`):**
   - Renders `"let’s collaborate"` as a real semantic `<button>` (or synced DOM overlay) aligned to `(P.x, P.y, ang, sc)` so it gets razor-sharp native typography, screen-reader semantics, keyboard Tab/Enter activation, and real click handling without fighting WebGL font rendering.

---

## 7. Prioritized Development Roadmap `[PROPOSED]`

### P0 — Fix Existing Bugs & Establish a Stable Foundation
*Goal: Make the existing Canvas 2D baseline rock-solid, responsive, accessible, and fast across desktop and mobile before adding shader/liquid complexity.*

- **Files to Modify:**
  - `let's collaborate (black tendrils).html` (or split into `index.html`, `styles.css`, `src/sim.js`, `src/render2d.js` once approved, keeping original file archived as baseline).
- **Components / Functions Involved:**
  - `[EXISTING]` `resize()`, `pillDims()`, `clamp()`, `drawPill()`, `drawHand()`, `drawArrow()`, `frame()`, global `pointermove`/`pointerdown` listeners, `#hint`, `reduce` flag.
  - `[PROPOSED]` `distToPillEdge()`, `drawStrandRibbon()`, `createPillSprite()`, `setupInput()`, `destroy()`.
- **Technical Implementation:**
  1. **Fix disengagement trap:** Measure distance `d` from cursor to **pill capsule boundary** (not center). Decouple pill-chase max travel radius from `Rout` (limit pill travel to a bounded leash around `home`, e.g., `maxLeash = Math.min(W * 0.22, 160px)`) and set sane responsive `Rin` / `Rout` clamped to viewport dimensions so users can reliably pull away and release on 320px–1440px screens.
  2. **Fix pointer/touch/idle behavior:** Filter by `ev.isPrimary`; fade `#hint` on `pointerdown` too; add `pointerup`, `pointercancel`, `pointerleave`, and `blur` handlers; hide custom `drawArrow`/`drawHand` when `ev.pointerType === 'touch'`; smoothly lerp ghost cursor back from last pointer position instead of teleporting after 7s idle.
  3. **Fix `prefers-reduced-motion`:** Listen to `matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', ...)`. When enabled, disable auto-demo orbit, stop continuous spring oscillation/ripples, and render a calm static/minimal-hover state.
  4. **Fix Canvas 2D bottlenecks & beading:** Pre-render static pill layers + blurred shadow onto an offscreen canvas (rebuilt only on `resize()`), keeping only the lightweight moving specular band `g5` dynamic. Replace 20-segment `stroke()` loops (360 draw calls) with **18 filled tapered ribbon polygons** (18 `fill()` calls) to eliminate semi-transparent round-cap beading.
  5. **Fix layout/font/a11y bugs:** Request `Inter:wght@500;700` (or system fallback), guard `clamp(v, min, max)` when `min > max`, add DPR-change & `visualViewport` resize listeners, add an `AbortController` + RAF cleanup handle, and bind an accessible `<button>` overlay for `"let’s collaborate"`.
- **Expected Visual Result:** Identical aesthetic to the original baseline, but visibly cleaner strands (no dark overlap beads), reliable release on every screen size, responsive touch interaction without phantom cursors, and smoother 60 FPS on mobile/Safari.
- **Potential Risks:**
  - Limiting pill chase leash changes the "feel" slightly compared to the original wide-roaming pill—leash radius and `Rout` will need tuning on both 375px and 1440px viewports.
  - Offscreen pill caching must account for `sc` (`1.0 → 1.1`) at `2x` DPR to avoid slight upscaling softness.

---

### P1 — Improve Organic Liquid Appearance
*Goal: Transform the rigid rounded-rect pill and flat black lines into a unified, glossy, living black liquid surface.*

- **Files to Modify / Create:**
  - `[PROPOSED]` `src/webgl/liquidRenderer.js` (WebGL2 quad pipeline & uniform/texture packer)
  - `[PROPOSED]` `src/webgl/liquid.frag.glsl` (2.5D SDF + `smin` fusion + glossy normal shading)
  - `[PROPOSED]` `src/sim.js` (accurate capsule boundary projection & organic surface noise parameters)
  - `index.html` (canvas layering + accessible button text overlay synced via CSS `transform`)
- **Components / Functions Involved:**
  - `[EXISTING]` Replaces/augments `drawPill()` and the strand drawing loop in `frame()` (preserving `render2d.js` as automatic fallback).
  - `[EXISTING]` Replaces superellipse anchor math (L161–L166) with exact **stadium/capsule closest-point & tangent projection**.
  - `[PROPOSED]` `sdCapsulePill()`, `sdTaperedSegment()`, `smin()`, `computeLiquidNormal()`, `shadeObsidianLiquid()`.
- **Technical Implementation:**
  1. Implement a WebGL2 fullscreen fragment shader computing `d_body = sdRoundedBox(...) + organicBreathingNoise(...)` and `d_strands = min_i(sdTaperedBezier_i(...))`, merged via polynomial smooth-minimum `smin(d_body, d_strands, k_merge)`.
  2. Compute smooth pseudo-3D height `h = sqrt(max(0, 1 - exp(d * sharpness)))` and surface normal via central differences of `h` in shader space.
  3. Apply dark glossy obsidian shading (base `#050507`, crisp top-left softbox specular, moving sheen, cool blue Fresnel rim matching the existing pill's palette).
  4. Replace the pill's hard white outer stroke (`g7`) with physical Fresnel rim lighting derived from the unified SDF—so highlights wrap seamlessly around both the pill *and* emerging strand roots!
- **Expected Visual Result:** The pill and strands fuse into one continuous wet, glossy black ferrofluid/tar-like substance with curved liquid fillets (menisci) where strands leave the body and coherent specular highlights flowing across every strand.
- **Potential Risks:**
  - Fragment shader loop cost over `18–24` multi-segment strands on low-end mobile GPUs (mitigate with per-strand 2D bounding-box early-out before evaluating segment SDFs).
  - Syncing DOM button typography transforms with WebGL canvas coordinates without 1-frame lag (apply CSS `transform: translate3d(...) rotate(...) scale(...)` inside the exact same RAF tick as WebGL draw).

---

### P2 — Implement Realistic Cursor Catching and Attachment
*Goal: Replace the binary global engagement toggle with believable anticipation, reaching pseudopods, and tactile cursor latching.*

- **Files to Modify:**
  - `[PROPOSED]` `src/sim.js` (proximity zones, per-strand FSM, surface bulge probes)
  - `[PROPOSED]` `src/webgl/liquid.frag.glsl` (cursor meniscus/cap SDF blobs + localized pill pull bulges)
- **Components / Functions Involved:**
  - `[EXISTING]` Replaces `engaged`, `e`, `Rin`, `Rout` logic (L145–L149) and static `ttx/tty` tip targeting (L174–L175).
  - `[PROPOSED]` `updateProximityZones()`, `updateStrandAttachment()`, `CursorAdhesionState`, `SurfaceBulge[]`.
- **Technical Implementation:**
  1. Define **3 spatial zones** relative to pill capsule surface:
     - **Idle (`d > R_sense`):** Subtle organic surface breathing only.
     - **Sense / Reach (`R_catch < d <= R_sense`):** Local surface bulge swells on the pill edge facing the cursor; 3–6 leading tendrils reach organically toward the cursor without full attachment yet.
     - **Catch / Latch (`d <= R_catch`):** Individual strands transition `REACHING → ATTACHED` upon tip-to-cursor contact (`dist(tip, C) < r_latch`), locking onto distinct local anchor offsets on the cursor/hand contour.
  2. Add small wet **cursor meniscus blobs** (SDF spheres blended via `smin` with attached strand tips) so the black substance visibly wraps and clings to the cursor/hand rather than stopping cleanly in mid-air.
  3. Add subtle velocity-based anchor creep so moving the cursor slowly causes new strands to catch while fast brushes catch fewer, thinner strands.
- **Expected Visual Result:** As the cursor approaches, the black glossy edge visibly swells and reaches out; once close enough, sticky tendrils visibly latch onto the cursor with wet attachment beads.
- **Potential Risks:**
  - Overly aggressive `R_catch` can feel intrusive; requires careful tuning so users feel natural "hover curiosity → sticky capture" progression.

---

### P3 — Implement Elastic Stretching and Multiple Tendrils
*Goal: Deliver authentic viscoelastic stretching, volume-conserving thinning, tension tautening, and multi-strand organic cohesion.*

- **Files to Modify:**
  - `[PROPOSED]` `src/sim.js` (multi-node Verlet/spring chains, tension/strain solver, dynamic strand spawning)
  - `[PROPOSED]` `src/webgl/liquid.frag.glsl` (variable-radius multi-segment chain SDF evaluation)
- **Components / Functions Involved:**
  - `[EXISTING]` Upgrades `S[]` strand structure (L53–L60) and 2-point `(tx,ty)/(cx,cy)` spring loop (L171–L189).
  - `[PROPOSED]` `StrandChain` (5 nodes per strand), `solveStrandPhysics()`, `computeHyperbolicRadius(t, strain)`, `applyReactionPullToPill()`.
- **Technical Implementation:**
  1. Upgrade each strand from 1 midpoint spring to a **4–5 node damped Verlet or spring chain** (`P0` pinned to pill surface, `P1..P3` free interior nodes with gravity sag + inertia, `P4` pinned to cursor latch).
  2. Calculate normalized strain $\varepsilon = \max(0, (L - L_0) / L_{\text{break}})$ per strand:
     - **Volume-conserving hyperbolic necking:** Profile radius $r(t)$ is thickest at both contact menisci (`t = 0` and `t = 1`) and pinches thinnest near the midpoint (`t ≈ 0.5`):
       $$r(t, \varepsilon) = r_{\text{end}} \cdot \text{meniscus}(t) + \frac{r_{\text{base}}}{\sqrt{1 + \alpha \varepsilon}} \cdot (1 - \beta \varepsilon \cdot 4t(1-t))$$
     - **Tension tautening:** Attenuate lateral wobble and gravity sag by `(1 - clamp(ε, 0, 1))²` so slack strands sway gently while high-tension strands pull razor-taut like real tar/gum.
  3. Apply a soft aggregate **elastic reaction force** from attached taut strands back onto the pill body (`P.vx, P.vy`) and local surface bulge, replacing the arbitrary hardcoded `0.9 * e` follow blend with physically motivated tugging.
  4. Allow dynamic strand count (e.g., 6–20 active strands based on proximity/dwell time) with varied thickness tiers (2–4 primary thick bridges + finer secondary webbing filaments).
- **Expected Visual Result:** Pulling the cursor away stretches multiple glossy strands of varied thickness; each bridge has flared wet roots at both ends, necks thinner in the center as distance grows, pulls taut under strain, and visibly tugs on the main black mass.
- **Potential Risks:**
  - Rendering `20 strands × 4 segments = 80` capsules in a fragment shader can pressure mobile fragment throughput—use tight per-strand AABB culling + cap active strand count on low-tier GPUs (e.g., 12 strands on mobile, 20 on desktop).

---

### P4 — Implement Breaking, Recoil and Self-Healing
*Goal: Create satisfying, physically believable snapping at max tension, elastic whipback, droplet residue, and seamless reabsorption.*

- **Files to Modify:**
  - `[PROPOSED]` `src/sim.js` (rupture criteria, strand splitting, recoil physics, droplet pool, surface ripple impulses)
  - `[PROPOSED]` `src/webgl/liquid.frag.glsl` (droplet SDFs + reabsorption surface ripple bumps)
- **Components / Functions Involved:**
  - `[PROPOSED]` `checkStrandRupture()`, `splitStrandAtNeck()`, `updateRecoilingStub()`, `updateDroplets()`, `triggerSurfaceRipple()`.
- **Technical Implementation:**
  1. **Staggered Rupture:** Give each strand a unique `maxStretch` (`L_break`, randomized `±25%` + scaled by thickness `s.w` so thin filaments snap first and thick primary strands hold longest) and strain-rate sensitivity (fast cursor flicks snap earlier).
  2. **Pre-Break Necking (Plateau–Rayleigh Pinch):** For $\varepsilon \in [0.85, 1.0]$, rapidly pinch `r(t_break)` toward `0.3px` near `t_break ∈ [0.42, 0.58]`.
  3. **Split & Elastic Recoil (`BROKEN → RECOILING`):**
     - **Pill-side half (`P0..P_break`):** Detached tip receives an elastic snap-back impulse along the strand tangent back toward `P0`, contracting rapidly with damped whip oscillation while thickening back up (volume conservation).
     - **Cursor-side half (`P_break..P_end`):** Contracts into a tiny glossy residue bead on the cursor/hand (or detaches as 1–2 micro-droplets in a fixed-size pool that briefly arc under gravity and shrink to zero).
  4. **Self-Healing (`HEALING → IDLE`):** When the pill-side stub retracts within the pill boundary, inject a short damped radial bump/ripple into the pill's SDF boundary at that anchor angle so the substance visibly absorbs the snapped strand and heals smoothly. Add a `0.4s–0.9s` refractory cooldown per strand before it can re-reach, preventing break/re-attach jitter.
- **Expected Visual Result:** Pulling away causes thinner strands to pinch and snap first, then thicker bridges rupture with snappy liquid whipback; the main surface ripples softly as it absorbs each snapped strand, while tiny wet beads shrink off the cursor.
- **Potential Risks:**
  - High recoil impulse velocities can overshoot through the pill center if underdamped; clamp recoil velocity and absorb cleanly once tip enters the pill interior SDF (`d_body < -4px`).

---

### P5 — Improve Lighting, Reflections & Performance
*Goal: Achieve studio-grade wet obsidian/ferrofluid visuals and rock-solid 60–120 FPS across all devices.*

- **Files to Modify:**
  - `[PROPOSED]` `src/webgl/liquid.frag.glsl` (upgraded studio BRDF, subtle iridescence/clearcoat, analytic soft shadow, anti-aliased SDF edges)
  - `[PROPOSED]` `src/perfMonitor.js` (adaptive DPR, frame-time budgeting, idle RAF sleep)
  - `[PROPOSED]` `src/webgl/liquidRenderer.js` (context-loss recovery, UBO/texture upload optimization)
- **Components / Functions Involved:**
  - `[PROPOSED]` `shadeStudioClearcoat()`, `computeAnalyticShadow()`, `AdaptiveQualityController`, `onContextLost()`, `onContextRestored()`.
- **Technical Implementation:**
  1. **Lighting & Reflections:**
     - Add dual-lobe Blinn-Phong / GGX specular highlights (tight wet clearcoat + soft studio overhead strip light) with subtle cursor-parallax light shift so reflections glide organically over the black surface as you move.
     - Add subtle cool-blue/indigo Fresnel rim + optional micro oil-slick chromatic tint at grazing angles.
     - Render crisp `fwidth()`-based SDF edge anti-aliasing so thin `1px` snapping strands stay silky smooth with zero shimmering.
     - Replace Canvas 2D's costly `shadowBlur` with a cheap analytic soft SDF shadow offset below the unified liquid mass (strands and droplets cast subtle matching shadows too).
  2. **Performance & Stability:**
     - **Adaptive DPR scaler:** Measure rolling 30-frame average; if frame time > `16.6ms`, smoothly step internal render scale from `min(dpr, 2)` down to `1.5` or `1.0` (maintaining crisp DOM text overlay).
     - **Idle RAF sleep:** Pause `requestAnimationFrame` when `document.hidden` is true or when `prefers-reduced-motion` is static; resume automatically on `pointermove`/`visibilitychange`.
     - **WebGL resilience:** Handle `webglcontextlost` / `webglcontextrestored` cleanly, with automatic fallback to `render2d.js`.
     - **Cross-device verification:** Test at `320px`, `375px`, `430px`, `768px`, `1024px`, and `1440px` across Chrome, Safari (macOS + iOS), and Firefox.
- **Expected Visual Result:** Photorealistic glossy black living liquid with crisp highlights across even hairline breaking filaments, grounded soft shadows, and steady 60 FPS on mobile and desktop.
- **Potential Risks:**
  - Mobile Safari WebGL2 float-texture quirks (`EXT_color_buffer_float` / `RGBA16F` vs uniform arrays): prefer standard `vec4` uniform arrays (universally supported in WebGL2 without extensions) over float data textures for maximum cross-browser reliability.

---

## 8. Exact Files & Functions Requiring Future Changes

### Existing Baseline File (Do Not Overwrite Original Without Backup)
| File | Existing Symbol / Lines | Phase(s) | Required Future Change |
| :--- | :--- | :--- | :--- |
| `let's collaborate (black tendrils).html` | `<link>` Google Font (L7) & `#hint` CSS (L15) | P0 | Add weight `500` to Google Fonts URL (or switch `#hint` to `400`/`700`) and ensure clean system fallback. |
| `let's collaborate (black tendrils).html` | `resize()` (L28–L32) | P0, P5 | Add DPR-change listener, `visualViewport` handling, offscreen sprite / WebGL viewport sync. |
| `let's collaborate (black tendrils).html` | `reduce` (L26) | P0 | Listen for live `prefers-reduced-motion` changes; pause continuous ghost demo & springs when enabled. |
| `let's collaborate (black tendrils).html` | `clamp()` (L35) & goal clamp (L154) | P0 | Guard against `min > max` on narrow/short viewports. |
| `let's collaborate (black tendrils).html` | `pointermove` / `pointerdown` (L47–L51) | P0, P2 | Filter `ev.isPrimary`, hide `#hint` on tap, add `pointerup`/`pointercancel`/`pointerleave`/`blur`, support touch detection & listener cleanup. |
| `let's collaborate (black tendrils).html` | `S[]` strand initialization (L53–L60) | P2, P3, P4 | Expand descriptor to support FSM state, multi-node Verlet chain, per-strand `maxStretch`, break point, and cooldown timer. |
| `let's collaborate (black tendrils).html` | `drawPill()` (L66–L109) | P0, P1, P5 | P0: cache static gradients + shadow on offscreen canvas; P1+: supersede with WebGL2 SDF liquid shader + accessible HTML `<button>` text overlay (keep 2D as fallback). |
| `let's collaborate (black tendrils).html` | `drawHand()` / `drawArrow()` (L111–L128) | P0, P2 | Hoist `shapes` array out of hot loop, fix `a` parameter shadowing, suppress on touch devices, align cursor-attachment meniscus offsets. |
| `let's collaborate (black tendrils).html` | Ghost cursor logic (L140–L144) | P0 | Smoothly blend from last pointer coordinate into idle orbit instead of teleporting; disable under `prefers-reduced-motion`. |
| `let's collaborate (black tendrils).html` | Proximity & hysteresis (L145–L149) | P0, P2 | Replace center distance with pill capsule edge distance; bound pill chase leash so `Rout` is always escapable; upgrade to 3-zone proximity (`IDLE`/`SENSE`/`CATCH`). |
| `let's collaborate (black tendrils).html` | Pill spring (L152–L158) | P0, P3 | Add viewport-safe leash clamp and strand-tension reaction force coupling. |
| `let's collaborate (black tendrils).html` | Anchor projection (L161–L167, L172–L173) | P1 | Replace $L^4$ superellipse + linear tangent overshoot with exact stadium/capsule surface projection. |
| `let's collaborate (black tendrils).html` | Strand physics & rendering loop (L169–L202) | P0, P1, P3, P4 | P0: skip hidden spring work when idle & replace 360 strokes with 18 filled ribbons; P1–P4: multi-node Verlet, hyperbolic necking, rupture/recoil/healing, SDF upload. |

### Proposed New Modular Structure (Recommended Starting P0/P1)
*(Keeping `let's collaborate (black tendrils).html` untouched as the original baseline reference.)*

| Proposed File | Responsibility | Target Phase |
| :--- | :--- | :--- |
| `index.html` & `styles.css` `[PROPOSED]` | Semantic `<button>` CTA overlay, accessible markup, responsive safe-area layout, canvas layering. | P0 |
| `src/input.js` `[PROPOSED]` | Unified primary-pointer mouse/touch tracking, idle demo smooth-blend, `prefers-reduced-motion`, `AbortController` teardown. | P0, P2 |
| `src/physics/simulation.js` `[PROPOSED]` | Pill capsule SDF math, 3-zone proximity, per-strand FSM (`IDLE` → `REACHING` → `ATTACHED` → `STRETCHING` → `NECKING` → `RECOILING` → `HEALING`), multi-node Verlet chains, droplets, surface ripples. | P0, P2, P3, P4 |
| `src/render/canvas2dFallback.js` `[PROPOSED]` | Optimized Canvas 2D renderer (cached pill sprite, 18 filled tapered ribbons) for P0 and non-WebGL fallback. | P0 |
| `src/render/webglLiquid.js` `[PROPOSED]` | WebGL2 fullscreen quad pipeline, uniform packing, context-loss recovery, adaptive DPR quality controller. | P1, P5 |
| `src/render/liquid.frag.glsl` `[PROPOSED]` | 2.5D SDF liquid shader (`sdCapsulePill`, `sdTaperedSegment`, `smin` fusion, analytic normals, studio clearcoat/Fresnel shading, soft shadow). | P1, P3, P4, P5 |

---

*End of Technical Audit Report. Awaiting your review and approval before beginning P0 or any implementation work.*
