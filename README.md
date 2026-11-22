# SYMBIOTE HAND (Cinematic Venom Liquid Experience)

A real-time webcam-based web experience built with **Three.js 0.160.0** and **MediaPipe Tasks Vision HandLandmarker 0.10.14**. The user's hand is tracked in 3D, and a black, wet, glossy liquid symbiote skin covers the hand using a fullscreen fragment-shader SDF raymarcher, accompanied by ~3,000 tiny liquid accent droplets, writhing fingertip tendrils, sticky pinch filaments, and in-shader glowing white predatory Venom eyes.

---

## Quick Start

### 1. Serve Locally
Modern browsers require a secure origin (`http://localhost` or `https://`) to access the webcam and load MediaPipe WebAssembly modules. **Do not open `index.html` directly via `file://`**.

Run the following command in the project directory:


python3 -m http.server 8000


### 2. Open in Browser
Navigate to:

http://localhost:8000
```
Grant camera permission when prompted by your browser.

---

## Gestures & Controls

| Gesture | How to Trigger (Camera) | How to Trigger (Mouse Fallback) | Visual Symbiote Reaction |
| :--- | :--- | :--- | :--- |
| **OPEN PALM** | Spread all 5 fingers facing camera | Move cursor with no buttons clicked | Liquid surface wobbles dynamically; 10 extra SDF tendril chains grow from fingertips and melt into the skin; accent droplets swirl around fingertips. |
| **FIST** | Curl all 4 fingers tightly into the palm | **Hold Left Mouse Button** | Hand radius thickens $1.4\times$ into bio-armor with raised pulsating veins (ridged noise); glowing predatory **Venom eyes** awaken on the back of the hand; droplets condense on knuckles. |
| **PINCH** | Touch Thumb Tip to Index Tip | **Hold Right Mouse Button** or **Spacebar** | Catenary-sagging sticky liquid bridge forms between thumb and index; bridge thins with distance (hyperbolic necking) and snaps with flying accent droplets if pulled too far. |
| **SPREAD** | Open palm and wave/whip hand rapidly | Move mouse rapidly across the screen | Explosive velocity burst: accent droplets scatter radially with motion stretch. |
| **IDLE** | Hand out of frame | Cursor stationary | Symbiote drifts into a calm, breathing liquid blob at the center. |

---

## Keyboard Shortcuts

- **`H`**: Toggle the minimalist monospace HUD on/off.
- **`M`**: Toggle between Camera tracking and Mouse Fallback mode.
- **`Spacebar`** (or **Right Click**): Trigger PINCH gesture in Mouse Fallback mode.
- **`Left Click` (hold)**: Trigger FIST gesture in Mouse Fallback mode.
- **Mouse Wheel**: Move synthetic hand forward / backward along the depth ($Z$) axis.

---

## Technical Highlights

1. **Fullscreen SDF Raymarching Skin:**
   - 21 MediaPipe hand landmarks mapped to 3D world space.
   - Built from capsule chains (5 fingers + palm volume) combined using polynomial smooth minimum (`smin`, $k \approx 0.04$).
   - Dynamic 3D simplex/curl noise surface displacement.
   - Bounding sphere early-exit optimization with a strict 48-step raymarching cap for rock-solid 60 FPS.
   - Adaptive resolution scaling: dynamically drops render target scale to 0.5 if FPS falls below 40.

2. **Wet Glossy Obsidian Material:**
   - Deep near-black base (`vec3(0.014, 0.014, 0.020)`).
   - Cold blue-white Fresnel rim lighting (`pow(1.0 - N.V, 3.6)`).
   - Studio softbox reflection streak from a procedural fake environment function (zero texture dependencies).
   - Sharp secondary key specular highlight and cold sky ambient gradient.
   - Dark purple translucent subsurface tint in thin areas (`vec3(0.26, 0.03, 0.35)`).

3. **In-Shader Venom Eyes:**
   - Slanted almond SDFs evaluated directly in the raymarching fragment shader on the dorsal surface of the hand.
   - Eyes open wide on **FIST** and close on other gestures.
   - High-intensity glowing white predatory core with cyan-tinted bloom falloff.

4. **Cinematic Post-Processing Pipeline:**
   - `EffectComposer` + `RenderPass` + `UnrealBloomPass` (threshold `0.82`, strength `0.62` so only specular highlights and eyes bloom).
   - Custom final composite pass: 35mm film grain, dark vignette, edge chromatic aberration, and a blue-black cinematic color grade on the webcam video layer.

5. **Minimalist HUD:**
   - Single monospace status line in the corner with gesture name, live FPS, tracking status, and key hints. Press `H` to toggle visibility.
