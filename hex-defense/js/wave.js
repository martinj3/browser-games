// The wave director: spawn scheduling, break timers, and the early-send bonus.

import { ENEMY_BY_ID } from './data/enemies.js';
import { EARLY_SEND_CASH_PER_SEC } from './constants.js';

export const PHASE = {
  BUILD: 'build',     // between waves; the break timer is running
  RUNNING: 'running', // enemies are spawning or still on the board
  DONE: 'done',       // every wave of the level has been cleared
};

export class WaveDirector {
  constructor(world, level) {
    this.world = world;
    this.level = level;
    this.waveIndex = -1;
    this.phase = PHASE.BUILD;
    this.breakTimer = level.waves[0].break;
    this.queue = [];        // pending spawns: { t, type, portal }
    this.elapsed = 0;
    this.spawnedAll = false;
  }

  get totalWaves() { return this.level.waves.length; }
  get displayWave() { return Math.max(1, this.waveIndex + 1); }
  get current() { return this.level.waves[this.waveIndex]; }

  /** Cash awarded for skipping the rest of the break. */
  earlySendBonus() {
    return Math.max(0, Math.round(this.breakTimer * EARLY_SEND_CASH_PER_SEC));
  }

  startNextWave(skipped = false) {
    if (this.phase !== PHASE.BUILD) return 0;
    const bonus = skipped ? this.earlySendBonus() : 0;
    this.waveIndex++;
    if (this.waveIndex >= this.totalWaves) { this.phase = PHASE.DONE; return 0; }

    const wave = this.current;
    const portals = wave.portals || ['A'];
    this.queue.length = 0;
    this.elapsed = 0;
    this.spawnedAll = false;

    // Groups run one after another; `overlap` pulls a group back into the tail
    // of the previous one, which is how the busier waves get their layering.
    let cursor = 0;
    for (const g of wave.groups) {
      const start = Math.max(0, cursor - (g.overlap || 0));
      for (let i = 0; i < g.n; i++) {
        // With two portals open, alternate so both sides stay busy.
        const portal = portals[i % portals.length];
        this.queue.push({ t: start + i * g.gap, type: g.t, portal });
      }
      cursor = start + g.n * g.gap;
    }
    this.queue.sort((a, b) => a.t - b.t);
    this.phase = PHASE.RUNNING;
    return bonus;
  }

  update(dt) {
    const world = this.world;
    if (this.phase === PHASE.BUILD) {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) this.startNextWave(false);
      return;
    }
    if (this.phase !== PHASE.RUNNING) return;

    this.elapsed += dt;
    while (this.queue.length && this.queue[0].t <= this.elapsed) {
      const item = this.queue.shift();
      world.spawnEnemy(item.type, item.portal, this.waveIndex);
    }
    if (this.queue.length === 0) this.spawnedAll = true;

    // The wave ends when everything spawned is off the board, one way or another.
    if (this.spawnedAll && world.enemies.every((e) => !e.alive)) {
      world.onWaveCleared(this.waveIndex);
      if (this.waveIndex + 1 >= this.totalWaves) {
        this.phase = PHASE.DONE;
      } else {
        this.phase = PHASE.BUILD;
        this.breakTimer = this.level.waves[this.waveIndex + 1].break;
      }
    }
  }

  /** Composition of the next wave, for the HUD's "incoming" readout. */
  previewNext() {
    const idx = this.waveIndex + (this.phase === PHASE.BUILD ? 1 : 0);
    const wave = this.level.waves[idx];
    if (!wave) return [];
    const counts = new Map();
    for (const g of wave.groups) counts.set(g.t, (counts.get(g.t) || 0) + g.n);
    return [...counts].map(([t, n]) => ({ def: ENEMY_BY_ID[t], count: n }));
  }
}
