// Targeting, damage, and the firing primitives every tower is built from.

import { TARGETING } from './data/towers.js';
import { SQRT3 } from './hex.js';
import { PROJ } from './entities/projectile.js';

// --- Spatial hash -----------------------------------------------------------
// Rebuilt each tick. Towers, splash and chain all query through it, so a late
// wave with 200 enemies on screen never turns into an all-pairs scan.

export class SpatialHash {
  constructor() { this.buckets = new Map(); this.cellSize = 48; this.result = []; }

  rebuild(enemies, cellSize) {
    this.cellSize = cellSize;
    this.buckets.clear();
    for (const e of enemies) {
      if (!e.alive) continue;
      const k = this.keyOf(e.x, e.y);
      let list = this.buckets.get(k);
      if (!list) { list = []; this.buckets.set(k, list); }
      list.push(e);
    }
  }

  keyOf(x, y) {
    return ((Math.floor(x / this.cellSize) + 4096) << 13) | (Math.floor(y / this.cellSize) + 4096);
  }

  /** Everything within `radius` of (x, y). Reuses one array -- copy if you keep it. */
  query(x, y, radius) {
    const out = this.result;
    out.length = 0;
    const cs = this.cellSize;
    const x0 = Math.floor((x - radius) / cs), x1 = Math.floor((x + radius) / cs);
    const y0 = Math.floor((y - radius) / cs), y1 = Math.floor((y + radius) / cs);
    const r2 = radius * radius;
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const list = this.buckets.get(((gx + 4096) << 13) | (gy + 4096));
        if (!list) continue;
        for (const e of list) {
          const dx = e.x - x, dy = e.y - y;
          if (dx * dx + dy * dy <= r2) out.push(e);
        }
      }
    }
    return out;
  }
}

// --- Damage -----------------------------------------------------------------

/**
 * Apply damage to one enemy. Armour is FLAT reduction rather than a percentage,
 * which is what makes cheap fast towers fall off against Tanks instead of
 * scaling forever.
 */
export function applyDamage(world, enemy, amount, ignoresArmor = false) {
  if (!enemy.alive) return 0;
  let dmg = amount;

  if (!ignoresArmor && enemy.def.armor) {
    // Never fully negated: a floor keeps chip damage meaningful.
    dmg = Math.max(dmg * 0.12, dmg - enemy.def.armor);
  }
  // A boss projects damage reduction onto everything around it.
  for (const boss of world.auraSources) {
    if (boss === enemy || !boss.alive) continue;
    const r = boss.def.auraRange * SQRT3 * world.grid.size;
    if (Math.hypot(boss.x - enemy.x, boss.y - enemy.y) <= r) {
      dmg *= (1 - boss.def.auraReduction);
      break;
    }
  }

  enemy.hitFlash = 0.09;
  if (enemy.shieldMax > 0) {
    enemy.shieldTimer = 0;
    if (enemy.shield > 0) {
      const absorbed = Math.min(enemy.shield, dmg);
      enemy.shield -= absorbed;
      dmg -= absorbed;
      world.emit({ type: 'shieldHit', x: enemy.x, y: enemy.y, r: enemy.def.radius * world.grid.size });
      if (dmg <= 0) return 0;
    }
  }

  enemy.hp -= dmg;
  if (enemy.hp <= 0) world.killEnemy(enemy);
  return dmg;
}

/** Damage everything inside a radius. Returns how many were hit. */
export function splashDamage(world, x, y, radius, amount, hitsAir, ignoresArmor = false) {
  const found = world.hash.query(x, y, radius);
  // query() reuses its array and applyDamage can kill (and re-enter), so copy.
  const targets = found.slice();
  let n = 0;
  for (const e of targets) {
    if (!e.alive) continue;
    if (e.def.flying && !hitsAir) continue;
    applyDamage(world, e, amount, ignoresArmor);
    n++;
  }
  return n;
}

// --- Target selection -------------------------------------------------------

function eligible(tower, enemy, world) {
  if (!enemy.targetable) return false;
  if (enemy.def.flying && !tower.def.hitsAir) return false;
  if (tower.minRangeHexes > 0) {
    const min = tower.minRangePx(world.grid);
    const d = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
    if (d < min) return false;
  }
  return true;
}

/** Distance-to-exit for sorting; flyers use straight-line distance instead. */
function progressOf(world, enemy) {
  if (enemy.def.flying) {
    const exit = world.grid.exits[0];
    return Math.hypot(exit.x - enemy.x, exit.y - enemy.y) / (SQRT3 * world.grid.size);
  }
  const d = enemy.cell ? enemy.cell.dist : Infinity;
  return d === Infinity ? 1e6 : d;
}

export function selectTarget(world, tower) {
  const candidates = world.hash.query(tower.x, tower.y, tower.rangePx(world.grid));
  let best = null, bestScore = -Infinity;
  const mode = tower.def.targeting || TARGETING.FIRST;

  for (const e of candidates) {
    if (!eligible(tower, e, world)) continue;
    let score;
    if (mode === TARGETING.STRONGEST) {
      score = e.hp;
    } else if (mode === TARGETING.CLUSTER) {
      // Count nearby company, so splash lands where it is worth landing.
      const near = world.hash.query(e.x, e.y, tower.splashPx(world.grid));
      let c = 0;
      for (const o of near) if (!o.def.flying || tower.def.hitsAir) c++;
      score = c * 1000 - progressOf(world, e);
    } else {
      score = -progressOf(world, e);   // FIRST: furthest along the path
    }
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best;
}

// --- Firing primitives ------------------------------------------------------
//
// Each tower definition names one of these. Keeping combat behaviour to a small
// set of shared primitives is what stops seven towers becoming seven bespoke
// combat systems.

export const PRIMITIVES = {
  hitscanSingle(world, tower) {
    const target = selectTarget(world, tower);
    if (!target) return false;
    tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);
    applyDamage(world, target, tower.damage);
    world.emit({
      type: 'tracer', x1: tower.x, y1: tower.y, x2: target.x, y2: target.y,
      color: tower.def.color,
    });
    world.emit({ type: 'impact', x: target.x, y: target.y, color: tower.def.color, power: 0.5 });
    tower.recoil = 1;
    return true;
  },

  /**
   * Fire down one of the six hex directions and damage everything on that line.
   * We pick the direction that catches the most enemies, which is what makes it
   * worth shaping your maze into a straight corridor in front of the tower.
   */
  hitscanLine(world, tower) {
    const range = tower.rangePx(world.grid);
    const halfWidth = world.grid.size * 0.55;
    const candidates = world.hash.query(tower.x, tower.y, range);
    if (candidates.length === 0) return false;
    const pool = candidates.slice();

    let bestDir = -1, bestCount = 0, bestHits = null;
    for (let d = 0; d < 6; d++) {
      // Direction vectors for flat-top neighbours, in DIRECTIONS order.
      const ang = -Math.PI / 2 + d * (Math.PI / 3);
      const ax = Math.cos(ang), ay = Math.sin(ang);
      const hits = [];
      for (const e of pool) {
        if (!eligible(tower, e, world)) continue;
        const dx = e.x - tower.x, dy = e.y - tower.y;
        const along = dx * ax + dy * ay;
        if (along < 0 || along > range) continue;
        const perp = Math.abs(dx * -ay + dy * ax);
        if (perp > halfWidth + e.def.radius * world.grid.size) continue;
        hits.push(e);
      }
      if (hits.length > bestCount) { bestCount = hits.length; bestDir = d; bestHits = hits; }
    }
    if (!bestHits || bestHits.length === 0) return false;

    const ang = -Math.PI / 2 + bestDir * (Math.PI / 3);
    tower.angle = ang;
    for (const e of bestHits) applyDamage(world, e, tower.damage);
    world.emit({
      type: 'beam', x: tower.x, y: tower.y, angle: ang, length: range,
      color: tower.def.color, width: halfWidth * 0.8,
    });
    for (const e of bestHits) {
      world.emit({ type: 'impact', x: e.x, y: e.y, color: tower.def.color, power: 0.8 });
    }
    tower.recoil = 1;
    return true;
  },

  /** Untargeted ring: hits everything in radius, and may apply a slow. */
  auraPulse(world, tower) {
    const range = tower.rangePx(world.grid);
    const found = world.hash.query(tower.x, tower.y, range).slice();
    let any = false;
    for (const e of found) {
      if (!e.alive) continue;
      if (e.def.flying && !tower.def.hitsAir) continue;
      any = true;
      if (tower.damage > 0) applyDamage(world, e, tower.damage);
      if (tower.def.slow) e.applySlow(tower.def.slow.factor, tower.def.slow.duration);
    }
    if (!any) return false;
    world.emit({ type: 'ring', x: tower.x, y: tower.y, r: range, color: tower.def.color });
    return true;
  },

  projectileSplash(world, tower) {
    const target = selectTarget(world, tower);
    if (!target) return false;
    tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);
    // Lead the shot, or slow targets would be the only ones ever hit.
    const speedPx = tower.def.shellSpeed * SQRT3 * world.grid.size;
    const dist = Math.hypot(target.x - tower.x, target.y - tower.y);
    const flight = dist / speedPx;
    const vel = velocityOf(world, target);
    const tx = target.x + vel.x * flight;
    const ty = target.y + vel.y * flight;
    world.spawnProjectile().launchShell(
      tower, tx, ty, speedPx, tower.damage, tower.splashPx(world.grid),
    );
    world.emit({ type: 'muzzle', x: tower.x, y: tower.y, angle: tower.angle, color: tower.def.color });
    tower.recoil = 1;
    return true;
  },

  chain(world, tower) {
    const first = selectTarget(world, tower);
    if (!first) return false;
    tower.angle = Math.atan2(first.y - tower.y, first.x - tower.x);
    const chainPx = tower.def.chainRange * SQRT3 * world.grid.size;
    const hit = new Set();
    const points = [tower.x, tower.y];
    let current = first;
    let damage = tower.damage;

    for (let i = 0; i < tower.def.chainCount && current; i++) {
      hit.add(current);
      points.push(current.x, current.y);
      applyDamage(world, current, damage);
      damage *= tower.def.chainFalloff;
      // Jump to the nearest enemy we have not zapped yet.
      const near = world.hash.query(current.x, current.y, chainPx).slice();
      let next = null, nd = Infinity;
      for (const e of near) {
        if (hit.has(e) || !e.alive || !e.targetable) continue;
        if (e.def.flying && !tower.def.hitsAir) continue;
        const d = Math.hypot(e.x - current.x, e.y - current.y);
        if (d < nd) { nd = d; next = e; }
      }
      current = next;
    }
    world.emit({ type: 'chain', points, color: tower.def.color });
    tower.recoil = 1;
    return true;
  },

  multiHoming(world, tower) {
    const target = selectTarget(world, tower);
    if (!target) return false;
    tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);
    const speedPx = tower.def.boltSpeed * SQRT3 * world.grid.size;
    for (let i = 0; i < tower.def.shots; i++) {
      world.spawnProjectile().launchBolt(
        tower, target, speedPx, tower.damage, !!tower.def.ignoresArmor,
      );
    }
    world.emit({ type: 'muzzle', x: tower.x, y: tower.y, angle: tower.angle, color: 0xffffff });
    tower.recoil = 1;
    return true;
  },
};

function velocityOf(world, enemy) {
  const dt = 1 / 60;
  return { x: (enemy.x - enemy.prevX) / dt, y: (enemy.y - enemy.prevY) / dt };
}

// --- Projectile integration -------------------------------------------------

export function updateProjectile(world, p, dt) {
  p.prevX = p.x; p.prevY = p.y;

  if (p.kind === PROJ.SHELL) {
    p.t += dt / p.duration;
    if (p.t >= 1) {
      p.alive = false;
      const hits = splashDamage(world, p.tx, p.ty, p.splashPx, p.damage, false);
      world.emit({ type: 'explosion', x: p.tx, y: p.ty, r: p.splashPx, color: p.color, hits });
      return;
    }
    const t = p.t;
    p.x = p.sx + (p.tx - p.sx) * t;
    p.y = p.sy + (p.ty - p.sy) * t;
    // Parabolic hop so the shell reads as arcing over the board rather than
    // sliding across it.
    p.y -= Math.sin(Math.PI * t) * p.arc;
    return;
  }

  // Homing bolt: steer toward the target, but keep momentum so it curves.
  p.life -= dt;
  if (p.life <= 0) { p.alive = false; return; }
  let tgt = p.target;
  if (!tgt || !tgt.alive) {
    tgt = null;
    const near = world.hash.query(p.x, p.y, world.grid.size * 6);
    let nd = Infinity;
    for (const e of near) {
      if (!e.targetable) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < nd) { nd = d; tgt = e; }
    }
    p.target = tgt;
  }
  if (tgt) {
    const dx = tgt.x - p.x, dy = tgt.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const steer = 9 * dt;
    p.vx += (dx / len * p.speed - p.vx) * steer;
    p.vy += (dy / len * p.speed - p.vy) * steer;
    const sp = Math.hypot(p.vx, p.vy) || 1;
    p.vx = p.vx / sp * p.speed;
    p.vy = p.vy / sp * p.speed;
    if (len < world.grid.size * 0.35) {
      applyDamage(world, tgt, p.damage, p.ignoresArmor);
      world.emit({ type: 'impact', x: p.x, y: p.y, color: p.color, power: 0.6 });
      p.alive = false;
      return;
    }
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
}
