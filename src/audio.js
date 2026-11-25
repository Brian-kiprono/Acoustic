/**
 * Stage 3 Web Audio API Engine
 * Manages AudioContext, AnalyserNode, Microphone stream capture,
 * uploaded audio file playback, and smoothed spectral band extraction.
 */
export class AudioEngine {
  constructor(onStateChange) {
    this.onStateChange = onStateChange || (() => {});

    this.context = null;
    this.analyser = null;
    this.freqData = null;

    // Microphone state
    this.micStream = null;
    this.micSource = null;
    this.isMicActive = false;

    // Uploaded audio state
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = 'anonymous';
    this.audioElement.preload = 'metadata';
    this.fileSource = null;
    this.objectUrl = null;
    this.hasFile = false;
    this.trackName = 'No audio file loaded';

    // Smoothed spectral features (0..1)
    this.features = {
      bass: 0,
      mid: 0,
      treble: 0,
      amplitude: 0,
      distribution: 0.5,
      active: false,
      sourceMode: 'none', // 'none' | 'mic' | 'file'
    };

    this._bindAudioElementEvents();
  }

  _ensureContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      throw new Error('Web Audio API is not supported in this browser.');
    }

    if (!this.context) {
      this.context = new AudioCtx();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.82;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    }

    if (this.context.state === 'suspended') {
      return this.context.resume();
    }
    return Promise.resolve();
  }

  _bindAudioElementEvents() {
    this.audioElement.addEventListener('loadedmetadata', () => {
      this.onStateChange();
    });

    this.audioElement.addEventListener('play', () => {
      this.onStateChange();
    });

    this.audioElement.addEventListener('pause', () => {
      this.onStateChange();
    });

    this.audioElement.addEventListener('ended', () => {
      this.onStateChange();
    });
  }

  async toggleMicrophone() {
    if (this.isMicActive) {
      this.stopMicrophone();
      return { ok: true, status: 'AUDIO: STANDBY', kind: 'standby' };
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return {
        ok: false,
        status: 'AUDIO: MIC UNSUPPORTED',
        kind: 'error',
        message: 'Microphone capture requires a modern browser over HTTPS or localhost.',
      };
    }

    try {
      // Pause file playback so live mic input takes clear priority
      if (this.hasFile && !this.audioElement.paused) {
        this.audioElement.pause();
      }

      await this._ensureContext();

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });

      this.micSource = this.context.createMediaStreamSource(this.micStream);
      this.micSource.connect(this.analyser);
      this.isMicActive = true;
      this.onStateChange();

      return { ok: true, status: 'AUDIO: MIC LIVE', kind: 'live' };
    } catch (err) {
      this.stopMicrophone();
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      return {
        ok: false,
        status: denied ? 'AUDIO: MIC DENIED' : 'AUDIO: MIC ERROR',
        kind: 'error',
        message: denied
          ? 'Microphone permission was denied. Enable mic access in browser settings to use live input.'
          : 'Unable to access microphone device.',
      };
    }
  }

  stopMicrophone() {
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch (_) {}
      this.micSource = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    this.isMicActive = false;
    this.onStateChange();
  }

  async loadAudioFile(file) {
    if (!file) return { ok: false };

    try {
      if (this.isMicActive) {
        this.stopMicrophone();
      }

      await this._ensureContext();

      if (this.objectUrl) {
        URL.revokeObjectURL(this.objectUrl);
      }

      this.objectUrl = URL.createObjectURL(file);
      this.audioElement.src = this.objectUrl;
      this.trackName = file.name;
      this.hasFile = true;

      if (!this.fileSource) {
        this.fileSource = this.context.createMediaElementSource(this.audioElement);
        this.fileSource.connect(this.analyser);
        this.analyser.connect(this.context.destination);
      }

      await this.audioElement.play();
      this.onStateChange();
      return { ok: true, status: 'AUDIO: TRACK PLAYING', kind: 'live' };
    } catch (err) {
      console.error('Failed to load audio file:', err);
      return {
        ok: false,
        status: 'AUDIO: FORMAT ERROR',
        kind: 'error',
        message: 'Could not decode or play this audio file in the browser.',
      };
    }
  }

  async togglePlayPause() {
    if (!this.hasFile) return;

    await this._ensureContext();
    if (this.audioElement.paused) {
      await this.audioElement.play();
    } else {
      this.audioElement.pause();
    }
    this.onStateChange();
  }

  seekToFraction(fraction) {
    if (!this.hasFile || !Number.isFinite(this.audioElement.duration)) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    this.audioElement.currentTime = clamped * this.audioElement.duration;
  }

  setVolume(vol) {
    this.audioElement.volume = Math.max(0, Math.min(1, vol));
  }

  clearAudio() {
    this.stopMicrophone();

    this.audioElement.pause();
    this.audioElement.removeAttribute('src');
    this.audioElement.load();

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    this.hasFile = false;
    this.trackName = 'No audio file loaded';
    this.onStateChange();
  }

  getPlaybackSnapshot() {
    const duration = Number.isFinite(this.audioElement.duration) ? this.audioElement.duration : 0;
    const currentTime = Number.isFinite(this.audioElement.currentTime) ? this.audioElement.currentTime : 0;
    return {
      hasFile: this.hasFile,
      isPlaying: this.hasFile && !this.audioElement.paused && !this.audioElement.ended,
      isMicActive: this.isMicActive,
      trackName: this.trackName,
      currentTime,
      duration,
      progress: duration > 0 ? currentTime / duration : 0,
    };
  }

  _avgRange(startHz, endHz) {
    if (!this.analyser || !this.freqData || !this.context) return 0;
    const nyquist = this.context.sampleRate * 0.5;
    const binCount = this.freqData.length;
    const startIdx = Math.max(0, Math.floor((startHz / nyquist) * binCount));
    const endIdx = Math.min(binCount - 1, Math.ceil((endHz / nyquist) * binCount));
    if (endIdx < startIdx) return 0;

    let sum = 0;
    let count = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      sum += this.freqData[i];
      count++;
    }
    return count > 0 ? sum / (count * 255) : 0;
  }

  update(deltaTime) {
    const dt = Math.min(deltaTime, 0.05);
    const isFilePlaying = this.hasFile && !this.audioElement.paused && !this.audioElement.ended;
    const active = this.isMicActive || isFilePlaying;

    let rawBass = 0;
    let rawMid = 0;
    let rawTreble = 0;
    let rawAmp = 0;
    let rawDist = 0.5;

    if (active && this.analyser && this.freqData) {
      this.analyser.getByteFrequencyData(this.freqData);

      rawBass = Math.min(1, this._avgRange(20, 250) * 1.25);
      rawMid = Math.min(1, this._avgRange(250, 4000) * 1.3);
      rawTreble = Math.min(1, this._avgRange(4000, 15000) * 1.45);

      let total = 0;
      let weightedSum = 0;
      for (let i = 0; i < this.freqData.length; i++) {
        const v = this.freqData[i] / 255;
        total += v;
        weightedSum += v * (i / this.freqData.length);
      }

      rawAmp = Math.min(1, (total / this.freqData.length) * 2.2);
      rawDist = total > 0.001 ? Math.min(1, (weightedSum / total) * 2.4) : 0.5;
    }

    const attackRate = 1 - Math.exp(-dt * 18);
    const releaseRate = 1 - Math.exp(-dt * 8);

    const smooth = (curr, target) => {
      const rate = target > curr ? attackRate : releaseRate;
      return curr + (target - curr) * rate;
    };

    this.features.bass = smooth(this.features.bass, rawBass);
    this.features.mid = smooth(this.features.mid, rawMid);
    this.features.treble = smooth(this.features.treble, rawTreble);
    this.features.amplitude = smooth(this.features.amplitude, rawAmp);
    this.features.distribution = smooth(this.features.distribution, rawDist);
    this.features.active = active;
    this.features.sourceMode = this.isMicActive ? 'mic' : isFilePlaying ? 'file' : 'none';

    return this.features;
  }

  dispose() {
    this.clearAudio();
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch (_) {}
      this.analyser = null;
    }
    if (this.context) {
      this.context.close().catch(() => {});
      this.context = null;
    }
  }
}