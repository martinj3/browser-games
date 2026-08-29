// The simulation. Owns the board, the entities and the run state, and steps
// everything on a fixed 60 Hz clock.
//
// The sim never touches Pixi. It emits plain FX event objects into a queue that
// the renderer drains each frame, which keeps fast-forward, headless balance
// runs and unit tests all possible.

import { Grid } from './grid.js';
import { PathField } from './pathfield.js';
import { Enemy, STATE } from './entities/enemy.js';
import { Tower } from './entities/tower.js';
import { Projectile } from './entities/projectile.js';
import { SpatialHash, PRIMITIVES, updateProjectile } from './combat.js';
import { WaveDirector, PHASE } from './wave.js';
import { TOWER_BY_ID } from './data/towers.js';
import { ENEMY_BY_ID } from './data/enemies.js';
import { SQRT3 } from './hex.js';
import {
  SELL_REFUND, WAVE_CLEAR_BONUS, WAVE_CLEAR_BONUS_GROWTH, LEAK_DAMAGE,
  BOSS_LEAK_DAMAGE, SCORE_PER_KILL, COMBO_DECAY_TIME, COMBO_DECAY_RATE,
  COMBO_MAX, INTENSITY_DECAY, SHAKE_DECAY,
} from './constants.js';

export const RESULT = { PLAYING: 0, WON: 1, LOST: 2 };

export class World {
  constructor(level, levelIndex) {
    this.level = level;
    this.levelIndex = levelIndex;
    this.grid = Grid.fromMap(level.map);
    // A default layout so positions exist before the first resize (and so the
    // headless balance harness works without a viewport at all).
    this.grid.layout(390, 620);
    this.pathfield = new PathField(this.grid);
    this.director = new WaveDirector(this, level);

    this.enemies = [];
    this.enemyPool = [];
    this.towers = [];
    this.projectiles = [];
    this.projectilePool = [];
    this.auraSources = [];
    this.hash = new SpatialHash();
    this.events = [];

    this.cash = level.startCash;
    this.health = level.health;
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.result = RESULT.PLAYING;
    this.time = 0;
    this.leaked = 0;
    this.kills = 0;

    // Presentation state the renderer reads but the sim owns, so that a
    // fast-forwarded frame shakes and flares by the right amount.
    this.shake = 0;
    this.intensity = 0;

    this.selected = null;
    this._enemyCells = [];
  }

  emit(ev) { this.events.push(ev); }

  // --- Placement ------------------------------------------------------------

  /** Cells currently occupied (or about to be entered) by ground enemies. */
  occupiedCells() {
    const out = this._enemyCells;
    out.length = 0;
    for (const e of this.enemies) {
      if (!e.alive || e.def.flying || !e.cell) continue;
      out.push(e.cell);
      // Also protect the cell it is walking into, or a tower could appear on
      // top of an enemy that is mid-edge.
      if (e.exitDir >= 0) {
        const n = neighborCell(this.grid, e.cell, e.exitDir);
        if (n) out.push(n);
      }
    }
    return out;
  }

  activeSpawnCells() {
    const wave = this.director.phase === PHASE.RUNNING
      ? this.director.current
      : this.level.waves[Math.min(this.director.waveIndex + 1, this.level.waves.length - 1)];
    const labels = new Set(wave ? (wave.portals || ['A']) : ['A']);
    // Every portal used anywhere in the level must stay open -- otherwise you
    // could wall off portal B during a portal-A wave and be stuck later.
    for (const w of this.level.waves) for (const p of (w.portals || ['A'])) labels.add(p);
    return this.grid.spawns.filter((s) => labels.has(s.label)).map((s) => s.cell);
  }

  /**
   * Is placing `towerId` on `cell` legal right now? Returns a reason string when
   * it is not, so the UI can say why rather than just refusing.
   */
  canPlace(towerId, cell) {
    const def = TOWER_BY_ID[towerId];
    if (!def) return 'unknown tower';
    if (!cell) return 'off board';
    if (!this.grid.isBuildable(cell)) return 'blocked';
    if (this.cash < def.cost) return 'no cash';
    if (!this.pathfield.allowsPlacement(cell, this.activeSpawnCells(), this.occupiedCells())) {
      return 'would seal the exit';
    }
    return null;
  }

  place(towerId, cell) {
    if (this.canPlace(towerId, cell)) return null;
    const def = TOWER_BY_ID[towerId];
    const tower = new Tower(def, cell);
    this.towers.push(tower);
    this.cash -= def.cost;
    this.pathfield.compute();
    this.emit({ type: 'build', x: cell.x, y: cell.y, color: def.color });
    return tower;
  }

  upgrade(tower) {
    if (tower.maxed || this.cash < tower.upgradeCost()) return false;
    this.cash -= tower.upgradeCost();
    tower.upgrade();
    this.emit({ type: 'build', x: tower.x, y: tower.y, color: tower.def.color });
    return true;
  }

  sellValue(tower) { return Math.floor(tower.invested * SELL_REFUND); }

  sell(tower) {
    this.cash += this.sellValue(tower);
    this.destroyTower(tower.cell, false);
  }

  destroyTower(cell, violent) {
    const tower = cell.tower;
    if (!tower) return;
    cell.tower = null;
    const i = this.towers.indexOf(tower);
    if (i >= 0) this.towers.splice(i, 1);
    if (this.selected === tower) this.selected = null;
    this.pathfield.compute();
    this.emit({
      type: violent ? 'towerLost' : 'sell',
      x: cell.x, y: cell.y, color: tower.def.color,
    });
    if (violent) this.addShake(9);
  }

  // --- Entities -------------------------------------------------------------

  spawnEnemy(typeId, portalLabel, waveIndex, at, hpOverride) {
    const spawn = at || (this.grid.spawns.find((s) => s.label === portalLabel) || this.grid.spawns[0]).cell;
    const e = this.enemyPool.pop() || new Enemy();
    e.spawn(this, typeId, spawn, this.levelIndex, waveIndex, hpOverride);
    this.enemies.push(e);
    if (e.def.auraRange) this.auraSources.push(e);
    return e;
  }

  spawnProjectile() {
    const p = this.projectilePool.pop() || new Projectile();
    this.projectiles.push(p);
    return p;
  }

  killEnemy(enemy) {
    if (!enemy.alive) return;
    enemy.alive = false;
    enemy.state = STATE.DEAD;
    this.kills++;

    this.cash += enemy.def.reward;
    this.score += Math.round(SCORE_PER_KILL * enemy.def.score * this.combo);
    this.combo = Math.min(COMBO_MAX, this.combo + 1);
    this.comboTimer = COMBO_DECAY_TIME;
    this.addIntensity(enemy.def.boss ? 0.9 : 0.06);
    if (enemy.def.boss) this.addShake(26);

    this.emit({
      type: 'death', x: enemy.x, y: enemy.y,
      color: enemy.def.color, radius: enemy.def.radius * this.grid.size,
      boss: !!enemy.def.boss,
    });

    if (enemy.def.splitInto) {
      const { type, count } = enemy.def.splitInto;
      const childHp = Math.round(enemy.maxHp * (ENEMY_BY_ID[type].hp / enemy.def.hp));
      for (let i = 0; i < count; i++) {
        const child = this.spawnEnemy(type, null, this.director.waveIndex, enemy.cell, childHp);
        // Scatter the children along the parent's step so they do not stack.
        child.entryDir = enemy.entryDir;
        child.exitDir = enemy.exitDir;
        child.t = Math.max(0, Math.min(0.95, enemy.t + (i - 1) * 0.14));
        child.updatePosition(this);
      }
    }
  }

  leak(enemy) {
    if (!enemy.alive) return;
    enemy.alive = false;
    this.leaked++;
    this.health -= enemy.def.boss ? BOSS_LEAK_DAMAGE : LEAK_DAMAGE;
    this.combo = 1;
    this.comboTimer = 0;
    this.addShake(12);
    this.emit({ type: 'leak', x: enemy.x, y: enemy.y, color: enemy.def.color });
    if (this.health <= 0) {
      this.health = 0;
      this.result = RESULT.LOST;
    }
  }

  onWaveCleared(waveIndex) {
    this.cash += WAVE_CLEAR_BONUS + waveIndex * WAVE_CLEAR_BONUS_GROWTH;
    this.emit({ type: 'waveCleared', wave: waveIndex });
  }

  addShake(amount) { this.shake = Math.min(1, this.shake + amount / 30); }
  addIntensity(amount) { this.intensity = Math.min(1, this.intensity + amount); }

  // --- Step -----------------------------------------------------------------

  step(dt) {
    if (this.result !== RESULT.PLAYING) return;
    this.time += dt;

    this.hash.rebuild(this.enemies, SQRT3 * this.grid.size);

    this.director.update(dt);

    for (const e of this.enemies) e.update(this, dt);

    for (const t of this.towers) {
      if (t.buildAnim > 0) t.buildAnim = Math.max(0, t.buildAnim - dt * 2.5);
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 6);
      t.spin += dt;
      t.cooldownTimer -= dt;
      if (t.cooldownTimer <= 0) {
        const fired = PRIMITIVES[t.def.primitive](this, t);
        if (fired) {
          t.cooldownTimer = t.cooldown;
          this.addIntensity(0.012);
        } else {
          // Nothing in range: re-check soon rather than burning the full cycle.
          t.cooldownTimer = Math.min(t.cooldown, 0.08);
        }
      }
    }

    for (const p of this.projectiles) updateProjectile(this, p, dt);

    // Combo decays after a lull, so bursts of kills are worth more than a
    // steady trickle -- which is what makes the late waves feel like a payoff.
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
    } else if (this.combo > 1) {
      this.combo = Math.max(1, this.combo - this.combo * COMBO_DECAY_RATE * dt);
    }

    this.intensity = Math.max(0, this.intensity - INTENSITY_DECAY * dt * (1 - this.intensity * 0.5));
    this.shake = Math.max(0, this.shake - SHAKE_DECAY * dt * (0.3 + this.shake));

    this.reap();

    if (this.director.phase === PHASE.DONE && this.result === RESULT.PLAYING) {
      this.result = RESULT.WON;
    }
  }

  reap() {
    let w = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.alive) { this.enemies[w++] = e; }
      else { this.enemyPool.push(e); }
    }
    this.enemies.length = w;

    w = 0;
    for (let i = 0; i < this.auraSources.length; i++) {
      const a = this.auraSources[i];
      if (a.alive) this.auraSources[w++] = a;
    }
    this.auraSources.length = w;

    w = 0;
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (p.alive) { this.projectiles[w++] = p; }
      else { p.target = null; this.projectilePool.push(p); }
    }
    this.projectiles.length = w;
  }

  /** Recompute screen positions after a resize. */
  relayout(width, height, padding, topInset) {
    this.grid.layout(width, height, padding, topInset);
    for (const e of this.enemies) {
      if (e.def.flying) continue;
      e.updatePosition(this);
      e.prevX = e.x; e.prevY = e.y;
    }
  }
}

function neighborCell(grid, cell, dir) {
  const D = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]][dir];
  return grid.at(cell.q + D[0], cell.r + D[1]);
}
