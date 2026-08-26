import * as THREE from 'three';
import {
  PLAY_RADIUS, PLAYER_MAX_SPEED, PLAYER_FIRE_COOLDOWN, PLAYER_SHIP_SCALE,
  PLAYER_HUE_RANGE, PLAYER_INVINCIBILITY_TIME,
} from './constants.js';
import { buildProceduralShip } from './enemyShip.js';

export class PlayerShip {
  constructor() {
    const hue = THREE.MathUtils.lerp(PLAYER_HUE_RANGE[0], PLAYER_HUE_RANGE[1], Math.random());
    const built = buildProceduralShip({ baseHue: hue, saturation: 0.6, lightness: 0.55 });
    this.mesh = built.mesh;
    this.mesh.scale.setScalar(PLAYER_SHIP_SCALE);
    this.collisionRadius = built.collisionRadius * PLAYER_SHIP_SCALE;

    this.materials = [];
    this.mesh.traverse((c) => { if (c.isMesh) this.materials.push(c.material); });
    this.baseColors = this.materials.map((m) => m.color.clone());

    this.position = new THREE.Vector3(0, 0, 0);
    this.mesh.position.copy(this.position);

    this.fireTimer = 0;
    this.invincibleTimer = 0;
    this.blinkTimer = 0;
  }

  get isInvincible() {
    return this.invincibleTimer > 0;
  }

  canFire() {
    return this.fireTimer <= 0;
  }

  fire() {
    this.fireTimer = PLAYER_FIRE_COOLDOWN;
  }

  takeHit() {
    if (this.isInvincible) return false;
    this.invincibleTimer = PLAYER_INVINCIBILITY_TIME;
    return true;
  }

  /**
   * Move using an explicit velocity vector (keyboard control), clamped to
   * PLAYER_MAX_SPEED and to the play circle.
   */
  moveWithVelocity(vx, vz, dt) {
    const v = new THREE.Vector2(vx, vz);
    if (v.lengthSq() > 1) v.normalize();
    this.position.x += v.x * PLAYER_MAX_SPEED * dt;
    this.position.z += v.y * PLAYER_MAX_SPEED * dt;
    this._clampToCircle();
  }

  /**
   * Steer toward a target point in the play plane at a capped speed, so
   * fast pointer movement (mouse/touch) causes lag rather than teleporting.
   */
  seekTarget(targetX, targetZ, dt) {
    const dx = targetX - this.position.x;
    const dz = targetZ - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-4) return;
    const step = Math.min(dist, PLAYER_MAX_SPEED * dt);
    this.position.x += (dx / dist) * step;
    this.position.z += (dz / dist) * step;
    this._clampToCircle();
  }

  _clampToCircle() {
    const r = Math.hypot(this.position.x, this.position.z);
    if (r > PLAY_RADIUS) {
      const k = PLAY_RADIUS / r;
      this.position.x *= k;
      this.position.z *= k;
    }
  }

  update(dt) {
    if (this.fireTimer > 0) this.fireTimer -= dt;
    if (this.invincibleTimer > 0) {
      this.invincibleTimer -= dt;
      this.blinkTimer += dt;
      const visible = Math.floor(this.blinkTimer * 12) % 2 === 0;
      this.mesh.visible = visible;
    } else {
      this.mesh.visible = true;
    }
    this.mesh.position.copy(this.position);
  }
}

export function createPlayerShip() {
  return new PlayerShip();
}
