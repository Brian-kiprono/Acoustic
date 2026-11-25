import * as THREE from 'three';

export class InteractionController {
  constructor(canvas, camera, sculptureGroup, prefersReducedMotion = false) {
    this.canvas = canvas;
    this.camera = camera;
    this.sculptureGroup = sculptureGroup;
    this.prefersReducedMotion = prefersReducedMotion;

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this._tmpHitPoint = new THREE.Vector3();

    this.targetWorldPos = new THREE.Vector3();
    this.smoothedWorldPos = new THREE.Vector3();

    this.isPointerInside = false;
    this.activeStrength = 0;
    this.polarity = 1.0;

    this.rippleOrigin = new THREE.Vector3();
    this.rippleStartTime = -1;
    this.rippleAge = -1;
    this.rippleStrength = 0;
    this._lastElapsed = 0;

    this._bindEvents();
  }

  setPolarity(mode) {
    this.polarity = mode === 'attract' ? -1.0 : 1.0;
  }

  _updatePointerPlane(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.ndc, this.camera);
    if (this.raycaster.ray.intersectPlane(this.interactionPlane, this._tmpHitPoint)) {
      this.targetWorldPos.copy(this._tmpHitPoint);
    }
  }

  _triggerRipple(clientX, clientY, elapsedTime) {
    this._updatePointerPlane(clientX, clientY);
    this.rippleOrigin.copy(this.targetWorldPos);
    this.rippleStartTime = elapsedTime;
    this.rippleAge = 0;
    this.rippleStrength = this.prefersReducedMotion ? 0.35 : 1.0;
  }

  _bindEvents() {
    this._onPointerMove = (e) => {
      this.isPointerInside = true;
      this._updatePointerPlane(e.clientX, e.clientY);
    };

    this._onPointerLeave = () => {
      this.isPointerInside = false;
    };

    this._onPointerDown = (e) => {
      this.isPointerInside = true;
      this._triggerRipple(e.clientX, e.clientY, this._lastElapsed);
    };

    this.canvas.addEventListener('pointermove', this._onPointerMove, { passive: true });
    this.canvas.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
    this.canvas.addEventListener('pointerdown', this._onPointerDown, { passive: true });
  }

  update(elapsedTime, deltaTime) {
    this._lastElapsed = elapsedTime;
    const damp = 1 - Math.exp(-Math.min(deltaTime, 0.05) * 11);

    this.smoothedWorldPos.lerp(this.targetWorldPos, damp);

    const targetActive = this.isPointerInside ? 1.0 : 0.0;
    this.activeStrength += (targetActive - this.activeStrength) * damp;

    if (this.rippleStartTime >= 0) {
      this.rippleAge = elapsedTime - this.rippleStartTime;
      if (this.rippleAge > 2.4) {
        this.rippleAge = -1;
        this.rippleStartTime = -1;
        this.rippleStrength = 0;
      }
    }

    const tiltFactor = this.prefersReducedMotion ? 0.02 : 0.14;
    const desiredRotY = THREE.MathUtils.clamp(this.smoothedWorldPos.x * 0.035, -0.22, 0.22);
    const desiredRotX = THREE.MathUtils.clamp(-this.smoothedWorldPos.y * 0.035, -0.14, 0.14);

    const idleRotY = Math.sin(elapsedTime * 0.32) * (this.prefersReducedMotion ? 0.02 : 0.09);
    const idleRotX = Math.cos(elapsedTime * 0.24) * (this.prefersReducedMotion ? 0.01 : 0.035);

    this.sculptureGroup.rotation.y += (idleRotY + desiredRotY * tiltFactor * 6 - this.sculptureGroup.rotation.y) * damp;
    this.sculptureGroup.rotation.x += (idleRotX + desiredRotX * tiltFactor * 6 - this.sculptureGroup.rotation.x) * damp;

    return {
      smoothedWorldPos: this.smoothedWorldPos,
      activeStrength: this.activeStrength,
      polarity: this.polarity,
      rippleOrigin: this.rippleOrigin,
      rippleAge: this.rippleAge,
      rippleStrength: this.rippleStrength,
      isEngaged: this.activeStrength > 0.05 || this.rippleAge >= 0,
    };
  }

  dispose() {
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
  }
}