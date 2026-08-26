import * as THREE from 'three';
import { BLACK_HOLE_HEIGHT, BLACK_HOLE_RADIUS, MU } from './constants.js';

export const BLACK_HOLE_POSITION = new THREE.Vector3(0, BLACK_HOLE_HEIGHT, 0);

export function createBlackHole() {
  const group = new THREE.Group();
  group.position.copy(BLACK_HOLE_POSITION);

  const eventHorizon = new THREE.Mesh(
    new THREE.SphereGeometry(BLACK_HOLE_RADIUS, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  group.add(eventHorizon);

  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(BLACK_HOLE_RADIUS * 1.04, 32, 24),
    new THREE.MeshBasicMaterial({
      color: 0x8899aa,
      transparent: true,
      opacity: 0.18,
      side: THREE.BackSide,
    })
  );
  group.add(rim);

  const glow = new THREE.PointLight(0x445566, 0.6, BLACK_HOLE_RADIUS * 14, 2);
  glow.position.set(0, 0, 0);
  group.add(glow);

  return group;
}

const _toPoint = new THREE.Vector3();

/**
 * Newtonian gravitational acceleration toward the black hole at `point`
 * (world space). Writes into `out` (a THREE.Vector3) and returns it.
 */
export function gravityAccelerationAt(point, out, mu = MU, softening = 0.6) {
  _toPoint.subVectors(BLACK_HOLE_POSITION, point);
  const distSq = _toPoint.lengthSq() + softening * softening;
  const dist = Math.sqrt(distSq);
  const accelMag = mu / distSq;
  return out.copy(_toPoint).divideScalar(dist).multiplyScalar(accelMag);
}
