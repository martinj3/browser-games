// Enemies: movement along the hex flow field, status effects, and the
// "trapped enemy eats a tower" fallback.

import { DIRECTIONS, key, SQRT3 } from '../hex.js';
import { ENEMY_BY_ID } from '../data/enemies.js';
import { BASE_HP, WAVE_HP_GROWTH, LEVEL_HP_SCALE, ENRAGE_WINDUP } from '../constants.js';

export const STATE = {
  WALKING: 0,
  ENRAGED: 1,   // no route to an exit: going to break a tower instead
  FLYING: 2,
  DEAD: 3,
};

function opposite(dir) { return (dir + 3) % 6; }

/** Health for a given enemy type at a given point in the campaign. */
export function healthFor(typeId, levelIndex, waveIndex) {
  const def = ENEMY_BY_ID[typeId];
  const levelScale = LEVEL_HP_SCALE[Math.min(levelIndex, LEVEL_HP_SCALE.length - 1)];
  return Math.round(def.hp * BASE_HP * levelScale * Math.pow(WAVE_HP_GROWTH, waveIndex));
}

let nextId = 1;

export class Enemy {
  constructor() { this.id = 0; this.alive = false; }

  spawn(world, typeId, cell, levelIndex, waveIndex, hpOverride) {
    const def = ENEMY_BY_ID[typeId];
    this.id = nextId++;
    this.def = def;
    this.alive = true;
    this.maxHp = hpOverride != null ? hpOverride : healthFor(typeId, levelIndex, waveIndex);
    this.hp = this.maxHp;
    this.shieldMax = def.shield ? this.maxHp * def.shield : 0;
    this.shield = this.shieldMax;
    this.shieldTimer = 0;
    this.slowFactor = 1;
    this.slowUntil = 0;
    this.hitFlash = 0;
    this.seed = (this.id * 2654435761) >>> 8;
    this.enrageTimer = 0;
    this.enrageTarget = null;
    this.spin = (this.seed % 100) / 100 * Math.PI * 2;

    this.cell = cell;
    this.x = cell.x; this.y = cell.y;
    this.prevX = this.x; this.prevY = this.y;

    if (def.flying) {
      this.state = STATE.FLYING;
      // Flyers ignore the board entirely and make straight for the exit.
      const exit = world.grid.exits[0];
      const dx = exit.x - cell.x, dy = exit.y - cell.y;
      const len = Math.hypot(dx, dy) || 1;
      this.vx = dx / len; this.vy = dy / len;
      this.phaseTimer = 0;
      this.phased = false;
      return this;
    }

    this.state = STATE.WALKING;
    // Enter from whichever side of the spawn cell is off the board.
    this.entryDir = 0;
    for (let d = 0; d < 6; d++) {
      if (!world.grid.cells.has(key(cell.q + DIRECTIONS[d].q, cell.r + DIRECTIONS[d].r))) {
        this.entryDir = d; break;
      }
    }
    this.t = 0;
    this.exitDir = world.pathfield.chooseDir(cell, this.seed);
    this.phaseTimer = 0;
    this.phased = false;
    this.updatePosition(world);
    return this;
  }

  get speed() {
    const base = this.def.speed;
    return base * (this.slowUntil > 0 ? this.slowFactor : 1);
  }

  applySlow(factor, duration) {
    if (this.def.slowImmune) return;
    // Strongest slow wins; refreshing extends it.
    if (factor < this.slowFactor || this.slowUntil <= 0) this.slowFactor = factor;
    this.slowUntil = Math.max(this.slowUntil, duration);
  }

  /** Untargetable while phased out. */
  get targetable() {
    return this.alive && !this.phased;
  }

  update(world, dt) {
    if (!this.alive) return;
    this.prevX = this.x; this.prevY = this.y;

    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.slowUntil > 0) {
      this.slowUntil -= dt;
      if (this.slowUntil <= 0) this.slowFactor = 1;
    }
    if (this.def.phase) {
      this.phaseTimer += dt;
      const cycle = this.def.phase.on + this.def.phase.off;
      this.phased = (this.phaseTimer % cycle) >= this.def.phase.on;
    }
    if (this.shieldMax > 0) {
      this.shieldTimer += dt;
      if (this.shieldTimer >= this.def.shieldRecharge && this.shield < this.shieldMax) {
        this.shield = Math.min(this.shieldMax, this.shield + this.shieldMax * this.def.shieldRate * dt);
      }
    }
    this.spin += dt * 1.6;

    switch (this.state) {
      case STATE.FLYING: this.updateFlying(world, dt); break;
      case STATE.ENRAGED: this.updateEnraged(world, dt); break;
      default: this.updateWalking(world, dt); break;
    }
  }

  updateFlying(world, dt) {
    const step = this.speed * SQRT3 * world.grid.size * dt;
    this.x += this.vx * step;
    this.y += this.vy * step;
    const exit = world.grid.exits[0];
    if (Math.hypot(exit.x - this.x, exit.y - this.y) < world.grid.size * 0.6) world.leak(this);
  }

  updateWalking(world, dt) {
    if (this.exitDir < 0) {
      // No route to an exit. Either we have arrived, or the board is sealed.
      if (world.grid.exits.includes(this.cell)) { world.leak(this); return; }
      this.beginEnrage(world);
      return;
    }

    this.t += this.speed * dt;
    while (this.t >= 1) {
      this.t -= 1;
      const d = DIRECTIONS[this.exitDir];
      const next = world.grid.at(this.cell.q + d.q, this.cell.r + d.r);
      if (!next || !world.grid.isWalkable(next)) {
        // The cell we were walking into stopped being walkable mid-step.
        this.t = 0;
        this.exitDir = world.pathfield.chooseDir(this.cell, this.seed);
        if (this.exitDir < 0) { this.beginEnrage(world); return; }
        break;
      }
      this.entryDir = opposite(this.exitDir);
      this.cell = next;
      if (world.grid.exits.includes(next)) { world.leak(this); return; }
      // Consult the flow field only at cell boundaries, so a re-path never
      // snaps or reverses an enemy in the middle of an edge.
      this.exitDir = world.pathfield.chooseDir(next, this.seed);
      if (this.exitDir < 0) { this.beginEnrage(world); return; }
    }
    this.updatePosition(world);
  }

  /**
   * Position along a quadratic Bezier from the entry-edge midpoint, through the
   * cell centre, to the exit-edge midpoint. A plain centre-to-centre lerp gives
   * a visible zig-zag kink at every cell; this curves through smoothly.
   */
  updatePosition(world) {
    const size = world.grid.size;
    const c = this.cell;
    if (this.exitDir < 0) { this.x = c.x; this.y = c.y; return; }
    const a = edgeMid(c, this.entryDir, size);
    const b = edgeMid(c, this.exitDir, size);
    const t = this.t;
    const it = 1 - t;
    this.x = it * it * a.x + 2 * it * t * c.x + t * t * b.x;
    this.y = it * it * a.y + 2 * it * t * c.y + t * t * b.y;
  }

  /**
   * Sealed in. Walk to the nearest tower that stands between us and the exit
   * and destroy it in one hit. The wind-up is deliberate: it gives the player a
   * beat to see what is happening and why they are about to lose a tower.
   */
  beginEnrage(world) {
    if (this.state === STATE.ENRAGED) return;
    this.state = STATE.ENRAGED;
    this.enrageTimer = ENRAGE_WINDUP;
    this.enrageTarget = world.pathfield.blockingNeighbor(this.cell);
    this.x = this.cell.x; this.y = this.cell.y;
    world.emit({ type: 'enrage', x: this.x, y: this.y });
  }

  updateEnraged(world, dt) {
    const target = this.enrageTarget;
    if (!target || !target.tower) {
      // Something already cleared the way (or nothing was ever blocking).
      this.state = STATE.WALKING;
      this.t = 0;
      this.exitDir = world.pathfield.chooseDir(this.cell, this.seed);
      if (this.exitDir < 0) { this.enrageTarget = world.pathfield.blockingNeighbor(this.cell); this.state = STATE.ENRAGED; }
      return;
    }
    this.enrageTimer -= dt;
    // Lean toward the doomed tower during the wind-up so the tell is legible.
    const lean = 1 - Math.max(0, this.enrageTimer) / ENRAGE_WINDUP;
    this.x = this.cell.x + (target.x - this.cell.x) * 0.45 * lean;
    this.y = this.cell.y + (target.y - this.cell.y) * 0.45 * lean;
    if (this.enrageTimer <= 0) {
      world.destroyTower(target, true);
      this.state = STATE.WALKING;
      this.t = 0;
      this.exitDir = world.pathfield.chooseDir(this.cell, this.seed);
    }
  }
}

function edgeMid(cell, dir, size) {
  const n = DIRECTIONS[dir];
  return {
    x: cell.x + (size * 1.5 * n.q) / 2,
    y: cell.y + (size * SQRT3 * (n.r + n.q / 2)) / 2,
  };
}
