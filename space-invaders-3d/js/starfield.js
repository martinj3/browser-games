import * as THREE from 'three';
import { STARFIELD_COUNT, STARFIELD_SPAWN_HEIGHT, STARFIELD_SPEED_MIN, STARFIELD_SPEED_MAX, WORLD_SIDE_BOUND } from './constants.js';
import { gravityAccelerationAt } from './blackHole.js';

const SPAWN_XZ_SPREAD = WORLD_SIDE_BOUND * 1.4;
const DESPAWN_Y = -8;
const GRAVITY_SOFTENING = 3; // gentler than gameplay bodies so decorative dust doesn't whip around too violently

export class Starfield {
  constructor(scene) {
    this.count = STARFIELD_COUNT;
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: false, transparent: true, opacity: 0.85 });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);

    for (let idx = 0; idx < this.count; idx++) {
      this._respawn(idx, true);
    }
  }

  _respawn(idx, initial = false) {
    const i3 = idx * 3;
    this.positions[i3 + 0] = (Math.random() - 0.5) * 2 * SPAWN_XZ_SPREAD;
    this.positions[i3 + 1] = initial
      ? DESPAWN_Y + Math.random() * (STARFIELD_SPAWN_HEIGHT - DESPAWN_Y)
      : STARFIELD_SPAWN_HEIGHT + Math.random() * 12;
    this.positions[i3 + 2] = -45 + Math.random() * 55;

    const speed = STARFIELD_SPEED_MIN + Math.random() * (STARFIELD_SPEED_MAX - STARFIELD_SPEED_MIN);
    const dir = new THREE.Vector3((Math.random() - 0.5) * 0.15, -1, 0.35 + Math.random() * 0.15).normalize();
    this.velocities[i3 + 0] = dir.x * speed;
    this.velocities[i3 + 1] = dir.y * speed;
    this.velocities[i3 + 2] = dir.z * speed;
  }

  update(dt) {
    const pos = this.positions;
    const vel = this.velocities;
    const p = new THREE.Vector3();
    const accel = new THREE.Vector3();

    for (let idx = 0; idx < this.count; idx++) {
      const i3 = idx * 3;
      p.set(pos[i3], pos[i3 + 1], pos[i3 + 2]);
      gravityAccelerationAt(p, accel, undefined, GRAVITY_SOFTENING);

      vel[i3 + 0] += accel.x * dt;
      vel[i3 + 1] += accel.y * dt;
      vel[i3 + 2] += accel.z * dt;

      pos[i3 + 0] += vel[i3 + 0] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;

      if (pos[i3 + 1] < DESPAWN_Y || Math.abs(pos[i3]) > SPAWN_XZ_SPREAD * 1.5) {
        this._respawn(idx, false);
      }
    }

    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

export function createStarfield(scene) {
  return new Starfield(scene);
}
