import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sculptureVertexShader, sculptureFragmentShader } from './shaders.js';

const FONT_URLS = {
  helvetiker: 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/fonts/helvetiker_bold.typeface.json',
  optimer: 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/fonts/optimer_bold.typeface.json',
  gentilis: 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/fonts/gentilis_bold.typeface.json',
};

export const DEFAULT_TYPOGRAPHY_STATE = Object.freeze({
  text: 'ACOUSTIC',
  fontKey: 'helvetiker',
  align: 'center',
  size: 1.2,
  depth: 0.38,
  letterSpacing: 0.08,
});

function subdivideGeometry(geometry, maxEdgeLength = 0.2, maxIterations = 3) {
  let currentGeo = geometry.index ? geometry.toNonIndexed() : geometry.clone();

  for (let iter = 0; iter < maxIterations; iter++) {
    const posAttr = currentGeo.getAttribute('position');
    const normAttr = currentGeo.getAttribute('normal');
    const positions = posAttr.array;
    const normals = normAttr.array;

    const newPositions = [];
    const newNormals = [];
    let didSplit = false;

    for (let i = 0; i < positions.length; i += 9) {
      const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
      const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
      const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];

      const nax = normals[i], nay = normals[i + 1], naz = normals[i + 2];
      const nbx = normals[i + 3], nby = normals[i + 4], nbz = normals[i + 5];
      const ncx = normals[i + 6], ncy = normals[i + 7], ncz = normals[i + 8];

      const ab = Math.hypot(bx - ax, by - ay, bz - az);
      const bc = Math.hypot(cx - bx, cy - by, cz - bz);
      const ca = Math.hypot(ax - cx, ay - cy, az - cz);
      const maxEdge = Math.max(ab, bc, ca);

      if (maxEdge <= maxEdgeLength) {
        newPositions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
        newNormals.push(nax, nay, naz, nbx, nby, nbz, ncx, ncy, ncz);
      } else {
        didSplit = true;
        if (ab >= bc && ab >= ca) {
          const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5;
          const nmx = (nax + nbx) * 0.5, nmy = (nay + nby) * 0.5, nmz = (naz + nbz) * 0.5;
          newPositions.push(ax, ay, az, mx, my, mz, cx, cy, cz, mx, my, mz, bx, by, bz, cx, cy, cz);
          newNormals.push(nax, nay, naz, nmx, nmy, nmz, ncx, ncy, ncz, nmx, nmy, nmz, nbx, nby, nbz, ncx, ncy, ncz);
        } else if (bc >= ab && bc >= ca) {
          const mx = (bx + cx) * 0.5, my = (by + cy) * 0.5, mz = (bz + cz) * 0.5;
          const nmx = (nbx + ncx) * 0.5, nmy = (nby + ncy) * 0.5, nmz = (nbz + ncz) * 0.5;
          newPositions.push(bx, by, bz, mx, my, mz, ax, ay, az, mx, my, mz, cx, cy, cz, ax, ay, az);
          newNormals.push(nbx, nby, nbz, nmx, nmy, nmz, nax, nay, naz, nmx, nmy, nmz, ncx, ncy, ncz, nax, nay, naz);
        } else {
          const mx = (cx + ax) * 0.5, my = (cy + ay) * 0.5, mz = (cz + az) * 0.5;
          const nmx = (ncx + nax) * 0.5, nmy = (ncy + nay) * 0.5, nmz = (ncz + naz) * 0.5;
          newPositions.push(cx, cy, cz, mx, my, mz, bx, by, bz, mx, my, mz, ax, ay, az, bx, by, bz);
          newNormals.push(ncx, ncy, ncz, nmx, nmy, nmz, nbx, nby, nbz, nmx, nmy, nmz, nax, nay, naz, nbx, nby, nbz);
        }
      }
    }

    currentGeo.dispose();
    if (!didSplit) {
      const rebuilt = new THREE.BufferGeometry();
      rebuilt.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
      rebuilt.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
      currentGeo = rebuilt;
      break;
    }

    const nextGeo = new THREE.BufferGeometry();
    nextGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    nextGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    currentGeo = nextGeo;
  }

  currentGeo.computeBoundingBox();
  const bb = currentGeo.boundingBox;
  const sizeX = Math.max(bb.max.x - bb.min.x, 0.001);
  const sizeY = Math.max(bb.max.y - bb.min.y, 0.001);
  const posAttr = currentGeo.getAttribute('position');
  const uvs = new Float32Array(posAttr.count * 2);

  for (let i = 0, j = 0; i < posAttr.count * 3; i += 3, j += 2) {
    uvs[j] = (posAttr.array[i] - bb.min.x) / sizeX;
    uvs[j + 1] = (posAttr.array[i + 1] - bb.min.y) / sizeY;
  }

  currentGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return currentGeo;
}

export class TypographyEngine {
  constructor(parentGroup, prefersReducedMotion = false) {
    this.parentGroup = parentGroup;
    this.prefersReducedMotion = prefersReducedMotion;
    this.loader = new FontLoader();
    this.fontCache = new Map();
    this._buildToken = 0;

    this.state = { ...DEFAULT_TYPOGRAPHY_STATE };

    this.uniforms = {
      uTime: { value: 0 },
      uMotionScale: { value: prefersReducedMotion ? 0.15 : 1.0 },
      uWaveSpeed: { value: 1.0 },
      uWaveIntensity: { value: 1.0 },
      uBaseColor: { value: new THREE.Color(0x0f1324) },
      uPrimaryAccent: { value: new THREE.Color(0x7c3aed) },
      uSecondaryAccent: { value: new THREE.Color(0x22d3ee) },
      uHighlightColor: { value: new THREE.Color(0xf8fafc) },
      uFresnelPower: { value: 2.5 },
      uMouseWorld: { value: new THREE.Vector3(0, 0, 0) },
      uMouseActive: { value: 0.0 },
      uCursorPolarity: { value: 1.0 },
      uRippleOrigin: { value: new THREE.Vector3(0, 0, 0) },
      uRippleAge: { value: -1.0 },
      uRippleStrength: { value: 0.0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uAmplitude: { value: 0 },
      uDistribution: { value: 0.5 },
    };

    this.material = new THREE.ShaderMaterial({
      vertexShader: sculptureVertexShader,
      fragmentShader: sculptureFragmentShader,
      uniforms: this.uniforms,
    });

    this.mesh = null;
  }

  async loadFont(fontKey) {
    if (this.fontCache.has(fontKey)) {
      return this.fontCache.get(fontKey);
    }

    const url = FONT_URLS[fontKey] || FONT_URLS.helvetiker;
    const font = await new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject);
    });

    this.fontCache.set(fontKey, font);
    return font;
  }

  async build(options = {}) {
    Object.assign(this.state, options);
    const token = ++this._buildToken;

    const cleanText = (this.state.text || DEFAULT_TYPOGRAPHY_STATE.text).trim().toUpperCase();
    const font = await this.loadFont(this.state.fontKey);
    if (token !== this._buildToken) return null;

    const lengthFactor = cleanText.length > 8 ? Math.max(0.55, 8 / cleanText.length) : 1.0;
    const effectiveSize = this.state.size * lengthFactor;

    const glyphGeos = [];
    let cursorX = 0;

    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      if (char === ' ') {
        cursorX += effectiveSize * (0.45 + this.state.letterSpacing);
        continue;
      }

      const glyphGeo = new TextGeometry(char, {
        font,
        size: effectiveSize,
        depth: this.state.depth,
        curveSegments: 9,
        bevelEnabled: true,
        bevelThickness: 0.032 * lengthFactor,
        bevelSize: 0.022 * lengthFactor,
        bevelOffset: 0,
        bevelSegments: 3,
      });

      glyphGeo.computeBoundingBox();
      const bb = glyphGeo.boundingBox;
      glyphGeo.translate(cursorX - bb.min.x, 0, 0);

      const glyphWidth = bb.max.x - bb.min.x;
      cursorX += glyphWidth + effectiveSize * this.state.letterSpacing;

      const nonIndexed = glyphGeo.index ? glyphGeo.toNonIndexed() : glyphGeo;
      if (!nonIndexed.getAttribute('normal')) {
        nonIndexed.computeVertexNormals();
      }
      glyphGeos.push(nonIndexed);
      if (nonIndexed !== glyphGeo) glyphGeo.dispose();
    }

    if (glyphGeos.length === 0) return 0;

    const merged = mergeGeometries(glyphGeos, false);
    glyphGeos.forEach((g) => g.dispose());
    merged.computeBoundingBox();
    const mbb = merged.boundingBox;
    const centerX = (mbb.min.x + mbb.max.x) * 0.5;
    const centerY = (mbb.min.y + mbb.max.y) * 0.5;
    const centerZ = (mbb.min.z + mbb.max.z) * 0.5;

    let offsetX = -centerX;
    if (this.state.align === 'left') {
      offsetX = -mbb.min.x - (mbb.max.x - mbb.min.x) * 0.32;
    } else if (this.state.align === 'right') {
      offsetX = -mbb.max.x + (mbb.max.x - mbb.min.x) * 0.32;
    }
    merged.translate(offsetX, -centerY, -centerZ);

    const edgeLimit = Math.max(0.14, 0.21 * lengthFactor);
    const denseGeometry = subdivideGeometry(merged, edgeLimit, 3);
    merged.dispose();

    if (token !== this._buildToken) {
      denseGeometry.dispose();
      return null;
    }

    if (this.mesh) {
      this.parentGroup.remove(this.mesh);
      this.mesh.geometry.dispose();
    }

    this.mesh = new THREE.Mesh(denseGeometry, this.material);
    this.parentGroup.add(this.mesh);

    return denseGeometry.getAttribute('position').count;
  }

  update(elapsedTime, interactionState, audioFeatures = null) {
    this.uniforms.uTime.value = elapsedTime;
    this.uniforms.uMouseWorld.value.copy(interactionState.smoothedWorldPos);
    this.uniforms.uMouseActive.value = interactionState.activeStrength;
    this.uniforms.uCursorPolarity.value = interactionState.polarity;
    this.uniforms.uRippleOrigin.value.copy(interactionState.rippleOrigin);
    this.uniforms.uRippleAge.value = interactionState.rippleAge;
    this.uniforms.uRippleStrength.value = interactionState.rippleStrength;

    if (audioFeatures) {
      this.uniforms.uBass.value = audioFeatures.bass;
      this.uniforms.uMid.value = audioFeatures.mid;
      this.uniforms.uTreble.value = audioFeatures.treble;
      this.uniforms.uAmplitude.value = audioFeatures.amplitude;
      this.uniforms.uDistribution.value = audioFeatures.distribution;
    }
  }

  dispose() {
    this._buildToken++;
    if (this.mesh) {
      this.parentGroup.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
    this.material.dispose();
  }
}