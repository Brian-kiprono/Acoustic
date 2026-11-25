import * as THREE from 'three';

export class AcousticScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.isContextLost = false;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050508, 0.032);

    this.camera = new THREE.PerspectiveCamera(42, this.width / this.height, 0.1, 100);
    this.camera.position.set(0, 0.15, 11.5);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });

    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.sculptureGroup = new THREE.Group();
    this.scene.add(this.sculptureGroup);

    this._setupSubtleEnvironment();
    this._bindEvents();
  }

  _setupSubtleEnvironment() {
    const ringGeo = new THREE.RingGeometry(6.8, 6.82, 128);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x7c3aed,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
    });
    this.horizonRing = new THREE.Mesh(ringGeo, ringMat);
    this.horizonRing.position.z = -2.5;
    this.scene.add(this.horizonRing);
  }

  _bindEvents() {
    this._onResize = this.handleResize.bind(this);
    this._onContextLost = (e) => {
      e.preventDefault();
      this.isContextLost = true;
    };
    this._onContextRestored = () => {
      this.isContextLost = false;
      this.handleResize();
    };

    window.addEventListener('resize', this._onResize, { passive: true });
    this.canvas.addEventListener('webglcontextlost', this._onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this._onContextRestored);
  }

  handleResize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.camera.aspect = this.width / this.height;
    const portraitOffset = this.camera.aspect < 1 ? (1 - this.camera.aspect) * 7.8 : 0;
    this.camera.position.z = 11.5 + portraitOffset;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  render() {
    if (this.isContextLost) return;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
    this.horizonRing.geometry.dispose();
    this.horizonRing.material.dispose();
    this.renderer.dispose();
  }
}