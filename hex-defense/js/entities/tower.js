// Towers: derived stats, upgrades, and the pad bonuses.

import {
  MAX_TOWER_LEVEL, UPGRADE_COST_GROWTH, UPGRADE_DAMAGE, UPGRADE_RATE,
  UPGRADE_RANGE_STEPS,
} from '../constants.js';
import { TERRAIN, PAD_POWER_DAMAGE, PAD_FOCUS_RANGE, PAD_FOCUS_RATE } from '../grid.js';
import { SQRT3 } from '../hex.js';

let nextId = 1;

export class Tower {
  constructor(def, cell) {
    this.id = nextId++;
    this.def = def;
    this.cell = cell;
    this.level = 1;
    this.invested = def.cost;
    this.cooldownTimer = 0;
    this.angle = -Math.PI / 2;
    this.recoil = 0;
    this.spin = 0;
    this.buildAnim = 1;      // 1 -> 0, drives the pop-in animation
    cell.tower = this;
    this.recompute();
  }

  get x() { return this.cell.x; }
  get y() { return this.cell.y; }

  /**
   * Recompute derived stats. Range is measured in whole hexes and only steps at
   * certain levels -- on a discrete grid a smooth 6%-per-level range curve would
   * mostly do nothing and then jump unpredictably.
   */
  recompute() {
    const d = this.def;
    const lvl = this.level;
    const powerPad = this.cell.terrain === TERRAIN.PAD_POWER;
    const focusPad = this.cell.terrain === TERRAIN.PAD_FOCUS;

    this.damage = d.damage * Math.pow(UPGRADE_DAMAGE, lvl - 1) * (powerPad ? PAD_POWER_DAMAGE : 1);
    this.cooldown = d.cooldown / (Math.pow(UPGRADE_RATE, lvl - 1) * (focusPad ? PAD_FOCUS_RATE : 1));
    this.rangeHexes = (d.range + UPGRADE_RANGE_STEPS[lvl - 1]) * (focusPad ? PAD_FOCUS_RANGE : 1);
    this.minRangeHexes = d.minRange || 0;
    this.splashHexes = d.splash || 0;
  }

  /** Range in pixels. Derived on demand so a window resize needs no fix-up. */
  rangePx(grid) { return this.rangeHexes * SQRT3 * grid.size; }
  minRangePx(grid) { return this.minRangeHexes * SQRT3 * grid.size; }
  splashPx(grid) { return this.splashHexes * SQRT3 * grid.size; }

  get maxed() { return this.level >= MAX_TOWER_LEVEL; }

  upgradeCost() {
    if (this.maxed) return Infinity;
    return Math.round(this.def.cost * Math.pow(UPGRADE_COST_GROWTH, this.level));
  }

  upgrade() {
    if (this.maxed) return false;
    this.invested += this.upgradeCost();
    this.level++;
    this.buildAnim = 0.6;
    this.recompute();
    return true;
  }
}
