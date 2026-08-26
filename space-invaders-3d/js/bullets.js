import * as THREE from 'three';
import {
  PLAYER_BULLET_SPEED, PLAYER_BULLET_RADIUS,
  ENEMY_BULLET_FALL_SPEED, ENEMY_BULLET_RADIUS,
  ENEMY_BULLET_ORBITAL_KICK_MIN, ENEMY_BULLET_ORBITAL_KICK_MAX,
  MU, WORLD_TOP_Y, WORLD_SIDE_BOUND,
} from './constants.js';
import { BLACK_HOLE_POSITION } from './blackHole.js';
import { propagateOrbit, stateToElements } from './orbitalMechanics.js';

const PLAYER_BULLET_GEO = new THREE.CylinderGeometry(PLAYER_BULLET_RADIUS, PLAYER_BULLET_RADIUS, 0.6, 6);
const PLAYER_BULLET_MAT = new THREE.MeshBasicMaterial({ color: 0x9fe6ff });

const ENEMY_BULLET_GEO = new THREE.SphereGeometry(ENEMY_BULLET_RADIUS, 8, 6);
const ENEMY_FALL_MAT = new THREE.MeshBasicMaterial({ color: 0xff8866 });
const ENEMY_ORBITAL_MAT = new THREE.MeshBasicMaterial({ color: 0xff5588 });

const ORBITAL_BULLET_MAX_LIFETIME = 9; // seconds; safety net for orbits that never re-cross the plane

export class BulletManager {
  constructor(scene) {
    this.scene = scene;
    this.playerBullets = [];
    this.enemyBullets = [];
  }

  spawnPlayerBullet(position) {
    const mesh = new THREE.Mesh(PLAYER_BULLET_GEO, PLAYER_BULLET_MAT);
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.playerBullets.push({
      mesh,
      position: position.clone(),
      velocity: new THREE.Vector3(0, PLAYER_BULLET_SPEED, 0),
      alive: true,
    });
  }

  /** kind: 'fall' (ignores gravity, drops straight down) or 'orbital' (two-body Kepler path). */
  spawnEnemyBullet(position, enemyVelocity, kind, t) {
    const mesh = new THREE.Mesh(ENEMY_BULLET_GEO, kind === 'fall' ? ENEMY_FALL_MAT : ENEMY_ORBITAL_MAT);
    mesh.position.copy(position);
    this.scene.add(mesh);

    if (kind === 'fall') {
      this.enemyBullets.push({
        mesh,
        kind,
        position: position.clone(),
        velocity: new THREE.Vector3(0, -ENEMY_BULLET_FALL_SPEED, 0),
        alive: true,
      });
    } else {
      const kickMag = ENEMY_BULLET_ORBITAL_KICK_MIN + Math.random() * (ENEMY_BULLET_ORBITAL_KICK_MAX - ENEMY_BULLET_ORBITAL_KICK_MIN);
      const kick = new THREE.Vector3(Math.random() - 0.5, -1.1 - Math.random() * 0.6, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(kickMag);
      const kickedVelocity = enemyVelocity.clone().add(kick);
      const relPos = position.clone().sub(BLACK_HOLE_POSITION);
      const elements = stateToElements(relPos, kickedVelocity, MU, t);
      this.enemyBullets.push({
        mesh,
        kind,
        position: position.clone(),
        elements,
        spawnT: t,
        alive: true,
      });
    }
  }

  update(t, dt) {
    for (const b of this.playerBullets) {
      b.position.addScaledVector(b.velocity, dt);
      b.mesh.position.copy(b.position);
      if (b.position.y > WORLD_TOP_Y) b.alive = false;
    }

    for (const b of this.enemyBullets) {
      if (b.kind === 'fall') {
        b.position.addScaledVector(b.velocity, dt);
      } else {
        const state = propagateOrbit(b.elements, t);
        b.position.copy(BLACK_HOLE_POSITION).add(state.position);
        if (t - b.spawnT > ORBITAL_BULLET_MAX_LIFETIME) b.alive = false;
      }
      b.mesh.position.copy(b.position);
      if (b.position.y < -3 || Math.abs(b.position.x) > WORLD_SIDE_BOUND || Math.abs(b.position.z) > WORLD_SIDE_BOUND) {
        b.alive = false;
      }
    }

    this._prune();
  }

  _prune() {
    for (const b of this.playerBullets) if (!b.alive) this.scene.remove(b.mesh);
    for (const b of this.enemyBullets) if (!b.alive) this.scene.remove(b.mesh);
    this.playerBullets = this.playerBullets.filter((b) => b.alive);
    this.enemyBullets = this.enemyBullets.filter((b) => b.alive);
  }

  clear() {
    for (const b of this.playerBullets) this.scene.remove(b.mesh);
    for (const b of this.enemyBullets) this.scene.remove(b.mesh);
    this.playerBullets = [];
    this.enemyBullets = [];
  }
}
