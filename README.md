# ACOUSTIC — Living Typography & Sound-Reactive 3D Sculpture

**ACOUSTIC** is an interactive WebGL and Web Audio installation built with pure HTML5, CSS3, ES6+ JavaScript, Three.js, GSAP, and custom GLSL vertex and fragment shaders. Visitors can enter custom words or phrases and watch beveled, subdivided 3D letterforms deform organically in real time in response to live microphone input, uploaded audio tracks, visual presets, and cursor wave physics.

---

## Features

* **Living Typography Engine (`src/typography.js`)**
  * Custom text input, typeface selection (`Helvetiker`, `Optimer`, `Gentilis`), alignment (`Left`, `Center`, `Right`), scale, letter spacing, and custom primary tint selection.
  * Multi-glyph layout with adaptive triangle subdivision so front/back faces and bevels deform smoothly on the GPU without jagged artifacts.
* **Custom GLSL Shaders (`src/shaders.js`)**
  * **Vertex Shader:** Combines multi-octave 3D Simplex noise (`snoise`), overlapping traveling waves, bass swell, treble shimmer, cursor proximity push/pull, and expanding radial click ripples, with finite-difference normal perturbation for realistic surface lighting.
  * **Fragment Shader:** Implements studio directional lighting, dynamic specular highlights, procedural fBM micro-grain, Fresnel edge luminescence, and spectral color sweeps.
* **Real-Time Web Audio API Engine (`src/audio.js`)**
  * **Microphone Mode:** Explicit user-triggered capture via `getUserMedia` with graceful permission-denied and unsupported-browser feedback.
  * **Audio Upload Mode:** Supports browser-compatible audio files with play/pause, progress scrubbing, current/total duration readouts, volume control, and clean `URL.revokeObjectURL` cleanup.
  * **Spectral Extraction:** Extracts smoothed **Bass**, **Mid**, **Treble**, **Overall Amplitude**, and **Spectral Distribution** values from an `AnalyserNode` (`fftSize = 2048`).
* **Interactive Cursor & Touch Physics (`src/interactions.js`)**
  * Raycasted plane projection with smooth exponential damping, **Repel** and **Attract** modes, subtle camera/sculpture tilt, and click/tap radial shockwaves.
* **Visual Presets & Motion Choreography (`src/presets.js`, `src/main.js`)**
  * Six distinct visual presets (*Violet Frequency*, *Liquid Chrome*, *Electric Pulse*, *Organic Waves*, *Soft Nebula*, and *Monochrome Sculpture*) that smoothly transition shader colors, Fresnel falloff, wave speed, wave intensity, fog, and horizon ring color via GSAP.
  * Respects `prefers-reduced-motion`, supports keyboard navigation and `Escape` drawer dismissal, and disposes GPU and audio resources cleanly on unload.

---

## Project Structure

```text
acoustic/
├── index.html
├── package.json
├── .gitignore
├── README.md
└── src/
    ├── main.js          # App orchestration, GSAP transitions, UI & loop
    ├── style.css        # Responsive studio HUD, drawer & visual styling
    ├── scene.js         # WebGLRenderer, camera, fog, resize & context loss
    ├── typography.js    # Font loader, glyph layout, subdivision & uniforms
    ├── shaders.js       # Custom GLSL vertex & fragment shaders
    ├── interactions.js  # Pointer/touch raycasting, polarity & click ripples
    ├── audio.js         # Web Audio API FFT analyzer, mic & file transport
    └── presets.js       # Six visual presets & shader/scene parameters
