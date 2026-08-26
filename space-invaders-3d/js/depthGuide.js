import * as THREE from 'three';
import { COLOR_DEPTH_GUIDE, COLOR_SPARK, WORLD_TOP_Y } from './constants.js';

function generateSparkTexture() {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

let sharedSparkTexture = null;

/**
 * Thin dim vertical guide line directly above the player's ship (the exact
 * path its bullets travel), with a small spark rendered wherever it
 * currently intersects an enemy ship — an aiming affordance for depth.
 */
export class DepthGuide {
  constructor(scene) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, WORLD_TOP_Y, 0),
    ]);
    this.material = new THREE.LineBasicMaterial({ color: COLOR_DEPTH_GUIDE, transparent: true, opacity: 0.35 });
    this.line = new THREE.Line(geometry, this.material);
    this.line.frustumCulled = false;
    scene.add(this.line);

    if (!sharedSparkTexture) sharedSparkTexture = generateSparkTexture();
    this.sparkMaterial = new THREE.SpriteMaterial({
      map: sharedSparkTexture,
      color: COLOR_SPARK,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.spark = new THREE.Sprite(this.sparkMaterial);
    this.spark.scale.setScalar(0.5);
    this.spark.visible = false;
    scene.add(this.spark);
  }

  update(playerPosition, enemies) {
    const posAttr = this.line.geometry.attributes.position;
    posAttr.setXYZ(0, playerPosition.x, playerPosition.y + 0.2, playerPosition.z);
    posAttr.setXYZ(1, playerPosition.x, WORLD_TOP_Y, playerPosition.z);
    posAttr.needsUpdate = true;

    let closest = null;
    let closestY = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive || enemy.dying) continue;
      const dx = enemy.position.x - playerPosition.x;
      const dz = enemy.position.z - playerPosition.z;
      const horizontalDist = Math.hypot(dx, dz);
      if (horizontalDist < enemy.collisionRadius && enemy.position.y > playerPosition.y) {
        if (enemy.position.y < closestY) {
          closestY = enemy.position.y;
          closest = enemy;
        }
      }
    }

    if (closest) {
      this.spark.visible = true;
      this.spark.position.set(playerPosition.x, closest.position.y, playerPosition.z);
      const s = 0.35 + Math.random() * 0.25;
      this.spark.scale.setScalar(s);
    } else {
      this.spark.visible = false;
    }
  }
}

export function createDepthGuide(scene) {
  return new DepthGuide(scene);
}
