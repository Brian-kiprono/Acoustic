import * as THREE from 'three';
import gsap from 'gsap';
import { AcousticScene } from './scene.js';
import { TypographyEngine, DEFAULT_TYPOGRAPHY_STATE } from './typography.js';
import { InteractionController } from './interactions.js';
import { AudioEngine } from './audio.js';
import { VISUAL_PRESETS, PRESET_LIST } from './presets.js';

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

class AcousticApp {
  constructor() {
    this.canvas = document.getElementById('acoustic-canvas');
    this.fallbackEl = document.getElementById('webgl-fallback');
    this.uiLayer = document.querySelector('.ui-layer');
    this.workspaceDock = document.getElementById('workspace-dock');
    this.statusEl = document.getElementById('engine-status');
    this.audioStatusEl = document.getElementById('audio-status');
    this.polyCountEl = document.getElementById('poly-count');
    this.cursorReadoutEl = document.getElementById('cursor-readout');

    this.enterStudioBtn = document.getElementById('enter-studio-btn');
    this.heroCtaBtn = document.getElementById('hero-cta-btn');
    this.openNotesBtn = document.getElementById('open-notes-btn');
    this.closeNotesBtn = document.getElementById('close-notes-btn');
    this.notesDrawer = document.getElementById('technical-notes-drawer');

    this.presetContainer = document.getElementById('preset-buttons');
    this.activePresetId = VISUAL_PRESETS.violetFrequency.id;

    this.micBtn = document.getElementById('mic-toggle-btn');
    this.fileInput = document.getElementById('audio-file-input');
    this.playPauseBtn = document.getElementById('play-pause-btn');
    this.audioResetBtn = document.getElementById('audio-reset-btn');
    this.seekSlider = document.getElementById('audio-seek-slider');
    this.currentTimeEl = document.getElementById('audio-current-time');
    this.durationEl = document.getElementById('audio-duration');
    this.volumeSlider = document.getElementById('audio-volume-slider');
    this.trackNameEl = document.getElementById('audio-track-name');

    this.meterBass = document.getElementById('meter-bass');
    this.meterMid = document.getElementById('meter-mid');
    this.meterTreble = document.getElementById('meter-treble');
    this.meterAmp = document.getElementById('meter-amp');

    this.textInput = document.getElementById('sculpture-text-input');
    this.fontSelect = document.getElementById('sculpture-font-select');
    this.alignBtns = Array.from(document.querySelectorAll('.align-btn'));
    this.sizeSlider = document.getElementById('sculpture-size-slider');
    this.spacingSlider = document.getElementById('sculpture-spacing-slider');
    this.accentColorPicker = document.getElementById('accent-color-picker');
    this.repelBtn = document.getElementById('mode-repel');
    this.attractBtn = document.getElementById('mode-attract');
    this.resetBtn = document.getElementById('reset-sculpture-btn');

    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.clock = new THREE.Clock();

    this._domCache = {
      bass: -1,
      mid: -1,
      treble: -1,
      amp: -1,
      timeText: '',
      readout: '',
    };

    try {
      this.sceneController = new AcousticScene(this.canvas);
    } catch (err) {
      console.error('WebGL initialization failed:', err);
      if (this.fallbackEl) this.fallbackEl.hidden = false;
      return;
    }

    this.typography = new TypographyEngine(
      this.sceneController.sculptureGroup,
      this.prefersReducedMotion
    );
    this.interactions = new InteractionController(
      this.canvas,
      this.sceneController.camera,
      this.sceneController.sculptureGroup,
      this.prefersReducedMotion
    );
    this.audio = new AudioEngine(() => this._syncAudioUI());

    this.rafId = null;
    this._init();
  }

  async _init() {
    this.sceneController.handleResize();
    this._renderPresetButtons();

    try {
      const vertexCount = await this.typography.build();
      if (vertexCount !== null) this._updateTelemetry(vertexCount);
      this.applyPreset(VISUAL_PRESETS.violetFrequency.id, true);
      this.statusEl.textContent = 'LIVING FIELD ACTIVE';
      this._playEntrance();
    } catch (error) {
      console.error('Failed to initialize sculpture:', error);
      this.statusEl.textContent = 'RENDER ERROR';
    }

    this._bindControls();
    this._syncAudioUI();
    this._animate();
  }

  _renderPresetButtons() {
    this.presetContainer.innerHTML = '';
    PRESET_LIST.forEach((preset) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-btn';
      btn.dataset.presetId = preset.id;
      btn.textContent = preset.label;
      if (preset.id === this.activePresetId) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', () => this.applyPreset(preset.id, false));
      this.presetContainer.appendChild(btn);
    });
  }

  applyPreset(presetId, instant = false) {
    const preset = VISUAL_PRESETS[presetId] || VISUAL_PRESETS.violetFrequency;
    this.activePresetId = preset.id;

    this.presetContainer.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.presetId === preset.id);
    });

    if (this.accentColorPicker) {
      this.accentColorPicker.value = preset.primaryAccent;
    }

    const dur = instant || this.prefersReducedMotion ? 0 : 0.75;
    document.body.style.backgroundColor = preset.bgColor;

    const u = this.typography.uniforms;
    const targetBase = new THREE.Color(preset.baseColor);
    const targetPri = new THREE.Color(preset.primaryAccent);
    const targetSec = new THREE.Color(preset.secondaryAccent);
    const targetHi = new THREE.Color(preset.highlightColor);

    gsap.to(u.uBaseColor.value, { r: targetBase.r, g: targetBase.g, b: targetBase.b, duration: dur, ease: 'power2.out' });
    gsap.to(u.uPrimaryAccent.value, { r: targetPri.r, g: targetPri.g, b: targetPri.b, duration: dur, ease: 'power2.out' });
    gsap.to(u.uSecondaryAccent.value, { r: targetSec.r, g: targetSec.g, b: targetSec.b, duration: dur, ease: 'power2.out' });
    gsap.to(u.uHighlightColor.value, { r: targetHi.r, g: targetHi.g, b: targetHi.b, duration: dur, ease: 'power2.out' });

    gsap.to(u.uFresnelPower, { value: preset.fresnelPower, duration: dur, ease: 'power2.out' });
    gsap.to(u.uWaveSpeed, { value: preset.waveSpeed, duration: dur, ease: 'power2.out' });
    gsap.to(u.uWaveIntensity, { value: preset.waveIntensity, duration: dur, ease: 'power2.out' });

    if (this.sceneController.horizonRing) {
      this.sceneController.horizonRing.material.color.setHex(preset.ringColor);
    }
    if (this.sceneController.scene.fog) {
      this.sceneController.scene.fog.color.setHex(preset.fogColor);
    }
  }

  _focusStudio() {
    this.uiLayer.setAttribute('data-view', 'studio');
    this.enterStudioBtn.classList.add('active');
    if (!this.prefersReducedMotion) {
      gsap.to(this.sceneController.camera.position, {
        y: -0.22,
        duration: 0.9,
        ease: 'power3.out',
      });
      gsap.fromTo(
        this.workspaceDock,
        { y: 12, opacity: 0.75 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out' }
      );
    }
    this.textInput.focus({ preventScroll: true });
  }

  _setNotesDrawer(open) {
    this.notesDrawer.setAttribute('aria-hidden', String(!open));
    this.openNotesBtn.setAttribute('aria-expanded', String(open));
    this.notesDrawer.classList.toggle('open', open);

    if (this.prefersReducedMotion) {
      gsap.set(this.notesDrawer, { x: open ? '0%' : '100%' });
      return;
    }

    gsap.to(this.notesDrawer, {
      x: open ? '0%' : '100%',
      duration: 0.45,
      ease: open ? 'power3.out' : 'power2.in',
    });
  }

  _setAudioBadge(text, kind = 'standby') {
    this.audioStatusEl.textContent = text;
    this.audioStatusEl.classList.remove('live', 'error');
    if (kind === 'live' || kind === 'error') {
      this.audioStatusEl.classList.add(kind);
    }
  }

  _syncAudioUI() {
    const snap = this.audio.getPlaybackSnapshot();

    this.micBtn.textContent = snap.isMicActive ? 'MIC ON' : 'MIC OFF';
    this.micBtn.classList.toggle('active', snap.isMicActive);
    this.micBtn.setAttribute('aria-pressed', String(snap.isMicActive));

    this.playPauseBtn.disabled = !snap.hasFile;
    this.playPauseBtn.textContent = snap.isPlaying ? 'PAUSE' : 'PLAY';

    this.seekSlider.disabled = !snap.hasFile || snap.duration <= 0;
    this.durationEl.textContent = formatTime(snap.duration);
    this.trackNameEl.textContent = snap.trackName;

    if (snap.isMicActive) {
      this._setAudioBadge('AUDIO: MIC LIVE', 'live');
    } else if (snap.isPlaying) {
      this._setAudioBadge('AUDIO: TRACK PLAYING', 'live');
    } else if (snap.hasFile) {
      this._setAudioBadge('AUDIO: PAUSED', 'standby');
    } else {
      this._setAudioBadge('AUDIO: STANDBY', 'standby');
    }
  }

  _playEntrance() {
    if (this.prefersReducedMotion) return;

    const group = this.sceneController.sculptureGroup;
    group.scale.set(0.86, 0.86, 0.86);

    gsap.to(group.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: 1.5,
      ease: 'power3.out',
    });

    gsap.from('.hero-overlay > *', {
      y: 16,
      opacity: 0,
      duration: 0.9,
      stagger: 0.09,
      ease: 'power3.out',
      clearProps: 'transform',
    });
  }

  _bindControls() {
    this.enterStudioBtn.addEventListener('click', () => this._focusStudio());
    this.heroCtaBtn.addEventListener('click', () => this._focusStudio());
    this.openNotesBtn.addEventListener('click', () => this._setNotesDrawer(true));
    this.closeNotesBtn.addEventListener('click', () => this._setNotesDrawer(false));

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.notesDrawer.classList.contains('open')) {
        this._setNotesDrawer(false);
      }
    });

    this.micBtn.addEventListener('click', async () => {
      const res = await this.audio.toggleMicrophone();
      if (!res.ok && res.message) {
        this._setAudioBadge(res.status, res.kind);
        this.trackNameEl.textContent = res.message;
      }
    });

    this.fileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const res = await this.audio.loadAudioFile(file);
      if (!res.ok && res.message) {
        this._setAudioBadge(res.status, res.kind);
        this.trackNameEl.textContent = res.message;
      }
      e.target.value = '';
    });

    this.playPauseBtn.addEventListener('click', async () => {
      await this.audio.togglePlayPause();
    });

    let isSeeking = false;
    this.seekSlider.addEventListener('pointerdown', () => {
      isSeeking = true;
    });
    this.seekSlider.addEventListener('input', (e) => {
      const frac = parseFloat(e.target.value) / 100;
      const snap = this.audio.getPlaybackSnapshot();
      this.currentTimeEl.textContent = formatTime(frac * snap.duration);
      this.audio.seekToFraction(frac);
    });
    const endSeek = () => {
      isSeeking = false;
    };
    this.seekSlider.addEventListener('pointerup', endSeek);
    this.seekSlider.addEventListener('change', endSeek);

    this.volumeSlider.addEventListener('input', (e) => {
      this.audio.setVolume(parseFloat(e.target.value));
    });

    this.audioResetBtn.addEventListener('click', () => {
      this.audio.clearAudio();
      this.seekSlider.value = 0;
      this.currentTimeEl.textContent = '00:00';
      this.durationEl.textContent = '00:00';
    });

    let textTimer = null;
    this.textInput.addEventListener('input', (e) => {
      clearTimeout(textTimer);
      textTimer = setTimeout(async () => {
        const count = await this.typography.build({
          text: e.target.value.trim() || DEFAULT_TYPOGRAPHY_STATE.text,
        });
        if (count !== null) this._updateTelemetry(count);
      }, 140);
    });

    this.fontSelect.addEventListener('change', async (e) => {
      const count = await this.typography.build({ fontKey: e.target.value });
      if (count !== null) this._updateTelemetry(count);
    });

    this.alignBtns.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const align = btn.dataset.align || 'center';
        this.alignBtns.forEach((b) => b.classList.toggle('active', b === btn));
        const count = await this.typography.build({ align });
        if (count !== null) this._updateTelemetry(count);
      });
    });

    this.sizeSlider.addEventListener('input', async (e) => {
      const count = await this.typography.build({ size: parseFloat(e.target.value) });
      if (count !== null) this._updateTelemetry(count);
    });

    this.spacingSlider.addEventListener('input', async (e) => {
      const count = await this.typography.build({ letterSpacing: parseFloat(e.target.value) });
      if (count !== null) this._updateTelemetry(count);
    });

    this.accentColorPicker.addEventListener('input', (e) => {
      this.typography.uniforms.uPrimaryAccent.value.set(e.target.value);
    });

    const setPolarityUI = (mode) => {
      this.interactions.setPolarity(mode);
      const isRepel = mode === 'repel';
      this.repelBtn.classList.toggle('active', isRepel);
      this.attractBtn.classList.toggle('active', !isRepel);
    };

    this.repelBtn.addEventListener('click', () => setPolarityUI('repel'));
    this.attractBtn.addEventListener('click', () => setPolarityUI('attract'));

    this.resetBtn.addEventListener('click', async () => {
      this.textInput.value = DEFAULT_TYPOGRAPHY_STATE.text;
      this.fontSelect.value = DEFAULT_TYPOGRAPHY_STATE.fontKey;
      this.sizeSlider.value = DEFAULT_TYPOGRAPHY_STATE.size;
      this.spacingSlider.value = DEFAULT_TYPOGRAPHY_STATE.letterSpacing;
      this.alignBtns.forEach((b) => b.classList.toggle('active', b.dataset.align === 'center'));
      setPolarityUI('repel');
      this.applyPreset(VISUAL_PRESETS.violetFrequency.id, false);

      const count = await this.typography.build({ ...DEFAULT_TYPOGRAPHY_STATE });
      if (count !== null) this._updateTelemetry(count);
    });

    this._isSeeking = () => isSeeking;

    window.addEventListener('beforeunload', () => {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.audio.dispose();
      this.interactions.dispose();
      this.typography.dispose();
      this.sceneController.dispose();
    });
  }

  _updateTelemetry(vertexCount) {
    this.polyCountEl.textContent = `VERTICES: ${vertexCount.toLocaleString()}`;
  }

  _updateMeters(features) {
    const b = Math.round(features.bass * 100);
    const m = Math.round(features.mid * 100);
    const t = Math.round(features.treble * 100);
    const a = Math.round(features.amplitude * 100);

    if (b !== this._domCache.bass) {
      this._domCache.bass = b;
      this.meterBass.style.width = `${b}%`;
    }
    if (m !== this._domCache.mid) {
      this._domCache.mid = m;
      this.meterMid.style.width = `${m}%`;
    }
    if (t !== this._domCache.treble) {
      this._domCache.treble = t;
      this.meterTreble.style.width = `${t}%`;
    }
    if (a !== this._domCache.amp) {
      this._domCache.amp = a;
      this.meterAmp.style.width = `${a}%`;
    }
  }

  _animate() {
    this.rafId = requestAnimationFrame(() => this._animate());

    const deltaTime = Math.min(this.clock.getDelta(), 0.05);
    const elapsedTime = this.clock.elapsedTime;

    const audioFeatures = this.audio.update(deltaTime);
    const interactionState = this.interactions.update(elapsedTime, deltaTime);
    this.typography.update(elapsedTime, interactionState, audioFeatures);

    this._updateMeters(audioFeatures);

    const snap = this.audio.getPlaybackSnapshot();
    if (snap.hasFile && !this._isSeeking()) {
      this.seekSlider.value = (snap.progress * 100).toFixed(1);
      const formatted = formatTime(snap.currentTime);
      if (formatted !== this._domCache.timeText) {
        this._domCache.timeText = formatted;
        this.currentTimeEl.textContent = formatted;
      }
    }

    if (this.cursorReadoutEl) {
      let nextReadout = 'FIELD: AMBIENT';
      if (audioFeatures.active) {
        nextReadout = `AUDIO: ${audioFeatures.sourceMode.toUpperCase()}`;
      } else if (interactionState.rippleAge >= 0) {
        nextReadout = 'FIELD: RIPPLE WAVE';
      } else if (interactionState.isEngaged) {
        nextReadout = interactionState.polarity > 0 ? 'FIELD: REPEL' : 'FIELD: ATTRACT';
      }

      if (nextReadout !== this._domCache.readout) {
        this._domCache.readout = nextReadout;
        this.cursorReadoutEl.textContent = nextReadout;
      }
    }

    this.sceneController.render();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new AcousticApp();
});