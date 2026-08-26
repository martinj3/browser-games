import {
  WAVE_BASE_COUNT, WAVE_COUNT_PER_LEVEL, WAVE_COUNT_MAX, WAVE_ARRIVAL_STAGGER,
  WAVE_CLEAR_PAUSE, WAVE_MIDWAVE_SPAWN_BASE_CHANCE, WAVE_MIDWAVE_SPAWN_PER_LEVEL,
  WAVE_ORBIT_SPEED_PER_LEVEL, WAVE_FIRE_RATE_PER_LEVEL,
} from './constants.js';
import { createEnemy, randomEnemyScale } from './enemyShip.js';

const MAX_MIDWAVE_EXTRAS = 6;

export class WaveManager {
  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.waveNumber = 0;
    this.state = 'idle'; // 'spawning-burst' | 'active' | 'clearing'
    this.waveClearTimer = 0;
    this.midwaveExtrasSpawned = 0;
    this.pendingBurst = 0;
  }

  get orbitSpeedMultiplier() {
    return 1 + (this.waveNumber - 1) * WAVE_ORBIT_SPEED_PER_LEVEL;
  }

  get fireIntervalMultiplier() {
    return Math.max(0.35, 1 - (this.waveNumber - 1) * WAVE_FIRE_RATE_PER_LEVEL);
  }

  startNextWave(t) {
    this.waveNumber += 1;
    this.midwaveExtrasSpawned = 0;
    const count = Math.min(WAVE_COUNT_MAX, WAVE_BASE_COUNT + (this.waveNumber - 1) * WAVE_COUNT_PER_LEVEL);
    for (let n = 0; n < count; n++) {
      const arrivalTime = t + 0.6 + n * WAVE_ARRIVAL_STAGGER + Math.random() * 0.1;
      this._spawnEnemy(t, arrivalTime);
    }
    this.state = 'active';
  }

  _spawnEnemy(now, arrivalTime) {
    const enemy = createEnemy({
      now,
      arrivalTime,
      scale: randomEnemyScale(),
      orbitSpeedMultiplier: this.orbitSpeedMultiplier,
      fireIntervalMultiplier: this.fireIntervalMultiplier,
    });
    this.scene.add(enemy.mesh);
    this.enemies.push(enemy);
  }

  /** Returns an array of enemies that should fire this frame. */
  update(t, dt) {
    const fireRequests = [];

    if (this.state === 'clearing') {
      this.waveClearTimer -= dt;
      if (this.waveClearTimer <= 0) {
        this.startNextWave(t);
      }
      return { fireRequests, waveJustCleared: false };
    }

    for (const enemy of this.enemies) {
      enemy.update(t, dt);
      if (enemy.canFire()) {
        fireRequests.push(enemy);
        enemy.resetFireTimer();
      }
    }

    const destroyed = this.enemies.filter((e) => e.destroyed);
    for (const e of destroyed) this.scene.remove(e.mesh);
    this.enemies = this.enemies.filter((e) => !e.destroyed);

    if (this.state === 'active') {
      const chance = WAVE_MIDWAVE_SPAWN_BASE_CHANCE + this.waveNumber * WAVE_MIDWAVE_SPAWN_PER_LEVEL;
      if (this.midwaveExtrasSpawned < MAX_MIDWAVE_EXTRAS && Math.random() < chance * dt) {
        this.midwaveExtrasSpawned += 1;
        this._spawnEnemy(t, t + 1.2 + Math.random() * 1.8);
      }

      const anyAlive = this.enemies.length > 0;
      if (!anyAlive) {
        this.state = 'clearing';
        this.waveClearTimer = WAVE_CLEAR_PAUSE;
        return { fireRequests, waveJustCleared: true };
      }
    }

    return { fireRequests, waveJustCleared: false };
  }

  reset() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
    this.waveNumber = 0;
    this.state = 'idle';
    this.waveClearTimer = 0;
  }
}
