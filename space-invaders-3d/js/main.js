import * as THREE from 'three';
import {
  CAMERA_FOV, CAMERA_NEAR, CAMERA_FAR, CAMERA_POSITION, CAMERA_LOOK_AT,
  COLOR_PLAY_CIRCLE, PLAY_RADIUS, PLAYER_LIVES_START,
  PLAYER_BULLET_RADIUS, ENEMY_BULLET_RADIUS, BULLET_TYPE_ORBITAL_CHANCE,
} from './constants.js';
import { createBlackHole } from './blackHole.js';
import { createPlayerShip } from './playerShip.js';
import { BulletManager } from './bullets.js';
import { WaveManager } from './waveManager.js';
import { createStarfield } from './starfield.js';
import { createInputManager } from './input.js';
import { createHud } from './hud.js';
import { createDepthGuide } from './depthGuide.js';

const viewport = document.getElementById('viewport');
const canvas = document.getElementById('game-canvas');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 55, 170);

const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
camera.position.set(...CAMERA_POSITION);
camera.lookAt(...CAMERA_LOOK_AT);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(viewport);
resize();

// --- Lighting ---
scene.add(new THREE.AmbientLight(0x40404a, 1.3));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(6, 30, 20);
scene.add(keyLight);

// --- Play circle (dark gray, against black background) ---
const playCircle = new THREE.Mesh(
  new THREE.CircleGeometry(PLAY_RADIUS, 64),
  new THREE.MeshBasicMaterial({ color: COLOR_PLAY_CIRCLE })
);
playCircle.rotation.x = -Math.PI / 2;
playCircle.position.y = -0.03;
scene.add(playCircle);

const playCircleRim = new THREE.Mesh(
  new THREE.RingGeometry(PLAY_RADIUS * 0.985, PLAY_RADIUS * 1.015, 64),
  new THREE.MeshBasicMaterial({ color: 0x45454e, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
);
playCircleRim.rotation.x = -Math.PI / 2;
playCircleRim.position.y = -0.02;
scene.add(playCircleRim);

// --- Core systems ---
scene.add(createBlackHole());
const starfield = createStarfield(scene);
const bulletManager = new BulletManager(scene);
const waveManager = new WaveManager(scene);
const depthGuide = createDepthGuide(scene);
const hud = createHud();

let player = createPlayerShip();
scene.add(player.mesh);

const inputManager = createInputManager({
  canvas,
  camera,
  trackpadEl: document.getElementById('trackpad'),
  trackpadNubEl: document.getElementById('trackpad-nub'),
  fireButtons: [document.getElementById('fire-left'), document.getElementById('fire-right')],
  onFire: () => handleFireInput(),
});

// --- Game state ---
let score = 0;
let lives = PLAYER_LIVES_START;
let simTime = 0;
let gameState = 'playing'; // 'playing' | 'gameover'
let showingWaveClear = false;

function handleFireInput() {
  if (gameState !== 'playing') return;
  if (!player.canFire()) return;
  player.fire();
  const gunPos = player.position.clone().add(new THREE.Vector3(0, 1.0, 0));
  bulletManager.spawnPlayerBullet(gunPos);
}

function onPlayerHit() {
  if (!player.takeHit()) return;
  lives -= 1;
  hud.setLives(Math.max(0, lives), PLAYER_LIVES_START);
  if (lives <= 0) {
    gameState = 'gameover';
    hud.showOverlay({
      title: 'GAME OVER',
      subtitle: `Score: ${score} — reached wave ${waveManager.waveNumber}`,
      buttonText: 'Restart',
      onButton: restartGame,
    });
  }
}

function restartGame() {
  score = 0;
  lives = PLAYER_LIVES_START;
  simTime = 0;
  showingWaveClear = false;
  hud.setScore(score);
  hud.setLives(lives, PLAYER_LIVES_START);
  bulletManager.clear();
  waveManager.reset();
  scene.remove(player.mesh);
  player = createPlayerShip();
  scene.add(player.mesh);
  waveManager.startNextWave(simTime);
  hud.setWave(waveManager.waveNumber);
  hud.hideOverlay();
  gameState = 'playing';
}

function handleCollisions() {
  for (const bullet of bulletManager.playerBullets) {
    if (!bullet.alive) continue;
    for (const enemy of waveManager.enemies) {
      if (!enemy.alive || enemy.dying) continue;
      if (bullet.position.distanceTo(enemy.position) < enemy.collisionRadius + PLAYER_BULLET_RADIUS) {
        bullet.alive = false;
        const destroyed = enemy.hit(1);
        if (destroyed) {
          score += 10 * enemy.maxHp;
          hud.setScore(score);
        }
        break;
      }
    }
  }

  if (!player.isInvincible) {
    for (const bullet of bulletManager.enemyBullets) {
      if (!bullet.alive) continue;
      if (bullet.position.distanceTo(player.position) < player.collisionRadius + ENEMY_BULLET_RADIUS) {
        bullet.alive = false;
        onPlayerHit();
        break;
      }
    }
  }

  if (!player.isInvincible) {
    for (const enemy of waveManager.enemies) {
      if (!enemy.alive || enemy.dying) continue;
      if (player.position.distanceTo(enemy.position) < player.collisionRadius + enemy.collisionRadius) {
        const destroyed = enemy.hit(enemy.maxHp);
        if (destroyed) {
          score += 10 * enemy.maxHp;
          hud.setScore(score);
        }
        onPlayerHit();
        break;
      }
    }
  }
}

function update(t, dt) {
  inputManager.update(dt, player);
  player.update(dt);
  starfield.update(dt);

  const { fireRequests, waveJustCleared } = waveManager.update(t, dt);
  for (const enemy of fireRequests) {
    const kind = Math.random() < BULLET_TYPE_ORBITAL_CHANCE ? 'orbital' : 'fall';
    bulletManager.spawnEnemyBullet(enemy.position, enemy.velocity, kind, t);
  }
  bulletManager.update(t, dt);

  handleCollisions();
  depthGuide.update(player.position, waveManager.enemies);

  hud.setWave(waveManager.waveNumber);

  if (waveJustCleared) {
    showingWaveClear = true;
    hud.showOverlay({ title: `WAVE ${waveManager.waveNumber} CLEARED`, subtitle: 'Next wave incoming…' });
  } else if (showingWaveClear && waveManager.state === 'active') {
    showingWaveClear = false;
    hud.hideOverlay();
  }
}

// --- Boot ---
hud.setScore(score);
hud.setLives(lives, PLAYER_LIVES_START);
waveManager.startNextWave(simTime);
hud.setWave(waveManager.waveNumber);

let lastNow = performance.now() / 1000;
function animate(nowMs) {
  requestAnimationFrame(animate);
  const now = nowMs / 1000;
  let dt = now - lastNow;
  lastNow = now;
  dt = Math.min(dt, 0.05);

  if (gameState === 'playing') {
    simTime += dt;
    update(simTime, dt);
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
