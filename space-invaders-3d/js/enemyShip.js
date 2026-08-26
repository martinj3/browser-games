import * as THREE from 'three';
import {
  MU,
  ENEMY_ORBIT_A_MIN, ENEMY_ORBIT_A_MAX, ENEMY_ORBIT_E_MIN, ENEMY_ORBIT_E_MAX,
  ENEMY_ORBIT_INCLINATION_MAX,
  ENEMY_SHIP_SCALE_MIN, ENEMY_SHIP_SCALE_MAX,
  ENEMY_HUE_EXCLUDE_RANGE,
  ENEMY_BASE_FIRE_INTERVAL_MIN, ENEMY_BASE_FIRE_INTERVAL_MAX,
} from './constants.js';
import { BLACK_HOLE_POSITION } from './blackHole.js';
import { propagateOrbit, randomStableElements, createHyperbolicApproach } from './orbitalMechanics.js';

const NOSE_AXIS = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------
// Procedural polyhedra ship builder — shared by enemy ships and the
// player's ship. Scatters box/tetrahedron/pyramid/flat-triangle primitives
// inside a tapered envelope (wide base, narrow nose along local +Y),
// rejecting any primitive that would poke outside the envelope.
// ---------------------------------------------------------------------

function envelopeRadius(y, height, baseRadius, shapePower) {
  const t = THREE.MathUtils.clamp(y / height, 0, 1);
  return baseRadius * (1 - Math.pow(t, shapePower)) + baseRadius * 0.06;
}

function makePrimitiveGeometry(type, size) {
  switch (type) {
    case 'box':
      return new THREE.BoxGeometry(size * 0.9, size * 0.55, size * 0.7);
    case 'tetra':
      return new THREE.TetrahedronGeometry(size * 0.65);
    case 'pyramid':
      return new THREE.ConeGeometry(size * 0.5, size * 0.95, 4);
    case 'triangle': {
      const geo = new THREE.BufferGeometry();
      const s = size * 0.6;
      const positions = new Float32Array([
        0, s, 0,
        -s * 0.6, -s * 0.4, 0,
        s * 0.6, -s * 0.4, 0,
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.computeVertexNormals();
      return geo;
    }
    default:
      return new THREE.BoxGeometry(size, size, size);
  }
}

function jitterColor(baseColor, amount) {
  const hsl = { h: 0, s: 0, l: 0 };
  baseColor.getHSL(hsl);
  const c = new THREE.Color();
  c.setHSL(
    (hsl.h + (Math.random() - 0.5) * amount + 1) % 1,
    THREE.MathUtils.clamp(hsl.s + (Math.random() - 0.5) * 0.15, 0, 1),
    THREE.MathUtils.clamp(hsl.l + (Math.random() - 0.5) * 0.18, 0.15, 0.85)
  );
  return c;
}

/**
 * Build a procedurally generated ship out of overlapping/intersecting
 * polyhedra. Nose (directional axis) points along local +Y; base sits
 * near local y=0.
 */
export function buildProceduralShip({ baseHue, saturation = 0.55, lightness = 0.5 } = {}) {
  const height = 1.6 + Math.random() * 1.0;
  const baseRadius = 0.55 + Math.random() * 0.35;
  const shapePower = 1.1 + Math.random() * 1.1;

  const symmetryRoll = Math.random();
  const symmetryMode = symmetryRoll < 0.55 ? 'bilateral' : symmetryRoll < 0.85 ? 'radial' : 'none';

  const hue = baseHue ?? Math.random();
  const baseColor = new THREE.Color().setHSL(hue, saturation, lightness);

  const group = new THREE.Group();
  const primitiveTypes = ['box', 'tetra', 'pyramid', 'triangle'];
  let primitiveCount = 0;
  let maxRadialExtent = baseRadius;
  let maxHeightExtent = height;

  function tryAddPrimitive(xOffset, zOffset, angleOffset) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const type = primitiveTypes[Math.floor(Math.random() * primitiveTypes.length)];
      const y = height * Math.pow(Math.random(), 1.4);
      const localEnvelope = envelopeRadius(y, height, baseRadius, shapePower);
      const size = localEnvelope * (0.7 + Math.random() * 0.9);

      const radialPos = Math.random() * Math.max(0, localEnvelope - size * 0.35);
      const angle = angleOffset + Math.random() * 0.6 - 0.3;
      const x = xOffset + Math.cos(angle) * radialPos;
      const z = zOffset + Math.sin(angle) * radialPos;

      const extentCheck = Math.hypot(x, z) + size * 0.35;
      if (extentCheck > localEnvelope * 1.25) continue; // rejection sample: pokes out of envelope

      const geo = makePrimitiveGeometry(type, size);
      const noseBias = (type === 'pyramid' || type === 'triangle') ? 0.75 : 0.2;
      const alignedQuat = new THREE.Quaternion(); // identity: local +Y already the nose axis
      const randomQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2)
      );
      const finalQuat = new THREE.Quaternion().slerpQuaternions(randomQuat, alignedQuat, noseBias * Math.random() + (type === 'pyramid' ? 0.2 : 0));

      const mat = new THREE.MeshStandardMaterial({
        color: jitterColor(baseColor, 0.06),
        roughness: 0.55,
        metalness: 0.25,
        flatShading: true,
        side: type === 'triangle' ? THREE.DoubleSide : THREE.FrontSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.quaternion.copy(finalQuat);
      group.add(mesh);

      primitiveCount++;
      maxRadialExtent = Math.max(maxRadialExtent, Math.hypot(x, z) + size * 0.5);
      maxHeightExtent = Math.max(maxHeightExtent, y + size * 0.5);
      return true;
    }
    return false;
  }

  const targetPrimitives = 5 + Math.floor(Math.random() * 5);

  if (symmetryMode === 'bilateral') {
    for (let n = 0; n < Math.ceil(targetPrimitives / 2); n++) {
      const xOffset = 0.15 + Math.random() * baseRadius * 0.7;
      const zOffset = (Math.random() - 0.5) * baseRadius * 0.6;
      const added = tryAddPrimitive(xOffset, zOffset, Math.random() * Math.PI * 2);
      if (added && xOffset > baseRadius * 0.12) {
        const last = group.children[group.children.length - 1];
        const mirror = last.clone();
        mirror.position.x *= -1;
        mirror.scale.x *= -1;
        group.add(mirror);
        primitiveCount++;
      }
    }
  } else if (symmetryMode === 'radial') {
    const blades = 2 + Math.floor(Math.random() * 5);
    const bladePrimCount = Math.max(1, Math.round(targetPrimitives / blades));
    const bladeGroup = new THREE.Group();
    const tempGroup = group;
    for (let n = 0; n < bladePrimCount; n++) {
      const radialPos = 0.2 + Math.random() * baseRadius * 0.7;
      tryAddPrimitive(radialPos, 0, 0);
    }
    // Move newly added children into the blade, then rotate-copy them.
    while (tempGroup.children.length) bladeGroup.add(tempGroup.children[0]);
    group.add(bladeGroup);
    for (let b = 1; b < blades; b++) {
      const copy = bladeGroup.clone();
      copy.rotation.y = (b / blades) * Math.PI * 2;
      group.add(copy);
      primitiveCount += bladeGroup.children.length;
    }
  } else {
    for (let n = 0; n < targetPrimitives; n++) {
      const xOffset = (Math.random() - 0.5) * baseRadius * 1.4;
      const zOffset = (Math.random() - 0.5) * baseRadius * 1.4;
      tryAddPrimitive(xOffset, zOffset, Math.random() * Math.PI * 2);
    }
  }

  if (primitiveCount === 0) {
    // Extremely unlikely fallback so a ship is never empty.
    tryAddPrimitive(0, 0, 0);
    primitiveCount = 1;
  }

  return {
    mesh: group,
    primitiveCount,
    collisionRadius: Math.max(maxRadialExtent, maxHeightExtent * 0.5) * 0.85,
    baseColor,
  };
}

// ---------------------------------------------------------------------
// Enemy entity: arrival (hyperbolic approach) -> capture -> stable orbit
// ---------------------------------------------------------------------

export class Enemy {
  constructor({ now, arrivalTime, scale, orbitSpeedMultiplier, fireIntervalMultiplier }) {
    const hue = pickEnemyHue();
    const built = buildProceduralShip({ baseHue: hue });
    this.mesh = built.mesh;
    this.mesh.scale.setScalar(scale);
    this.collisionRadius = built.collisionRadius * scale;
    this.materials = [];
    this.mesh.traverse((child) => {
      if (child.isMesh) this.materials.push(child.material);
    });
    this.baseColors = this.materials.map((m) => m.color.clone());

    this.mu = MU;
    this.orbitSpeedMultiplier = orbitSpeedMultiplier;
    this.targetElements = randomStableElements({
      aMin: ENEMY_ORBIT_A_MIN,
      aMax: ENEMY_ORBIT_A_MAX,
      eMin: ENEMY_ORBIT_E_MIN,
      eMax: ENEMY_ORBIT_E_MAX,
      iMax: ENEMY_ORBIT_INCLINATION_MAX,
      mu: this.mu,
      periapsisTime: arrivalTime,
    });
    const { approachElements, spawnTime } = createHyperbolicApproach(this.targetElements, arrivalTime, this.mu);
    this.approachElements = approachElements;
    this.arrivalTime = arrivalTime;
    this.spawnTime = spawnTime;
    this.phase = 'approaching';

    const maxHp = THREE.MathUtils.clamp(Math.round(built.primitiveCount / 2), 1, 4);
    this.hp = maxHp;
    this.maxHp = maxHp;

    this.fireInterval = THREE.MathUtils.lerp(ENEMY_BASE_FIRE_INTERVAL_MIN, ENEMY_BASE_FIRE_INTERVAL_MAX, Math.random()) * fireIntervalMultiplier;
    this.fireTimer = this.fireInterval * (0.3 + Math.random() * 0.7);
    this.hitFlashTimer = 0;
    this.destroyed = false;
    this.dying = false;
    this.dyingTimer = 0;
    this.alive = false; // becomes true once spawnTime has passed
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.mesh.visible = false;
  }

  simTime(realT) {
    return this.arrivalTime + (realT - this.arrivalTime) * this.orbitSpeedMultiplier;
  }

  update(t, dt) {
    if (this.dying) {
      this.dyingTimer += dt;
      const k = Math.max(0, 1 - this.dyingTimer / 0.35);
      this.mesh.scale.setScalar(this._scaleAtDeath * k);
      this.mesh.rotation.y += dt * 6;
      if (this.dyingTimer > 0.35) this.destroyed = true;
      return;
    }

    if (t < this.spawnTime) return;
    if (!this.alive) {
      this.alive = true;
      this.mesh.visible = true;
    }

    let state;
    if (this.phase === 'approaching' && t < this.arrivalTime) {
      state = propagateOrbit(this.approachElements, t);
    } else {
      if (this.phase === 'approaching') this.phase = 'stable';
      state = propagateOrbit(this.targetElements, this.simTime(t));
    }

    this.position.copy(BLACK_HOLE_POSITION).add(state.position);
    this.velocity.copy(state.velocity);
    this.mesh.position.copy(this.position);

    if (this.velocity.lengthSq() > 1e-6) {
      const dir = this.velocity.clone().normalize();
      const targetQuat = new THREE.Quaternion().setFromUnitVectors(NOSE_AXIS, dir);
      this.mesh.quaternion.slerp(targetQuat, Math.min(1, dt * 4));
    }

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      const flashOn = this.hitFlashTimer > 0;
      for (const m of this.materials) {
        m.color.set(flashOn ? 0xffffff : m.color.getHex());
      }
      if (!flashOn) this._restoreColors();
    }

    if (this.phase === 'stable') {
      this.fireTimer -= dt;
    }
  }

  _restoreColors() {
    this.materials.forEach((m, idx) => m.color.copy(this.baseColors[idx]));
  }

  canFire() {
    return this.phase === 'stable' && !this.dying && this.fireTimer <= 0;
  }

  resetFireTimer() {
    this.fireTimer = this.fireInterval * (0.7 + Math.random() * 0.6);
  }

  hit(damage = 1) {
    if (this.dying) return false;
    this.hp -= damage;
    this.hitFlashTimer = 0.12;
    for (const m of this.materials) m.color.set(0xffffff);
    if (this.hp <= 0) {
      this.dying = true;
      this._scaleAtDeath = this.mesh.scale.x;
      return true;
    }
    return false;
  }
}

function pickEnemyHue() {
  const [lo, hi] = ENEMY_HUE_EXCLUDE_RANGE;
  let hue;
  do {
    hue = Math.random();
  } while (hue > lo - 0.05 && hue < hi + 0.05);
  return hue;
}

export function createEnemy(options) {
  return new Enemy(options);
}

export function randomEnemyScale() {
  return ENEMY_SHIP_SCALE_MIN + Math.random() * (ENEMY_SHIP_SCALE_MAX - ENEMY_SHIP_SCALE_MIN);
}
