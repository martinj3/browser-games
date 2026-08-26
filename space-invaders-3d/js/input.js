import * as THREE from 'three';
import { PLAY_RADIUS } from './constants.js';

const MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);

export class InputManager {
  constructor({ canvas, camera, trackpadEl, trackpadNubEl, fireButtons, onFire }) {
    this.canvas = canvas;
    this.camera = camera;
    this.onFire = onFire;
    this.trackpadNubEl = trackpadNubEl;

    this.keys = new Set();
    this.mode = 'keyboard'; // 'keyboard' | 'pointer' | 'touch'
    this.pointerTarget = new THREE.Vector2(0, 0);
    this.hasPointerTarget = false;

    this._raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._touchId = null;

    window.addEventListener('keydown', (e) => this._handleKeyDown(e));
    window.addEventListener('keyup', (e) => this._handleKeyUp(e));

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this._aimAt(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      this._aimAt(e.clientX, e.clientY);
      this._fire();
    });

    if (trackpadEl) {
      trackpadEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this._touchId = e.pointerId;
        trackpadEl.setPointerCapture(e.pointerId);
        this._handleTrackpad(e, trackpadEl);
      });
      trackpadEl.addEventListener('pointermove', (e) => {
        if (this._touchId !== e.pointerId) return;
        e.preventDefault();
        this._handleTrackpad(e, trackpadEl);
      });
      const releaseTouch = (e) => {
        if (this._touchId !== e.pointerId) return;
        this._touchId = null;
      };
      trackpadEl.addEventListener('pointerup', releaseTouch);
      trackpadEl.addEventListener('pointercancel', releaseTouch);
    }

    for (const btn of fireButtons || []) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this._fire();
      });
    }
  }

  _handleKeyDown(e) {
    if (MOVE_KEYS.has(e.code)) {
      this.keys.add(e.code);
      this.mode = 'keyboard';
    }
    if (e.code === 'Space') {
      e.preventDefault();
      this._fire();
    }
  }

  _handleKeyUp(e) {
    if (MOVE_KEYS.has(e.code)) this.keys.delete(e.code);
  }

  _aimAt(clientX, clientY) {
    if (this.keys.size > 0) return; // keyboard takes priority while held
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1)
    );
    this._raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this._raycaster.ray.intersectPlane(this._plane, hit)) {
      this.mode = 'pointer';
      this.pointerTarget.set(hit.x, hit.z);
      this.hasPointerTarget = true;
    }
  }

  _handleTrackpad(e, trackpadEl) {
    const rect = trackpadEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (e.clientX - cx) / (rect.width / 2);
    let dy = (e.clientY - cy) / (rect.height / 2);
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }

    if (this.trackpadNubEl) {
      this.trackpadNubEl.style.transform = `translate(-50%, -50%) translate(${dx * rect.width * 0.32}px, ${dy * rect.height * 0.32}px)`;
    }

    this.mode = 'touch';
    this.pointerTarget.set(dx * PLAY_RADIUS, dy * PLAY_RADIUS);
    this.hasPointerTarget = true;
  }

  _fire() {
    if (this.onFire) this.onFire();
  }

  update(dt, player) {
    if (this.keys.size > 0) {
      let vx = 0, vz = 0;
      if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) vx -= 1;
      if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) vx += 1;
      if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) vz -= 1;
      if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) vz += 1;
      player.moveWithVelocity(vx, vz, dt);
    } else if (this.mode !== 'keyboard' && this.hasPointerTarget) {
      player.seekTarget(this.pointerTarget.x, this.pointerTarget.y, dt);
    }
  }
}

export function createInputManager(opts) {
  return new InputManager(opts);
}
