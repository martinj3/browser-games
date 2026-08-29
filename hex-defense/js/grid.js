// The board: cell terrain, tower occupancy, and screen layout.

import { key, toPixel, DIRECTIONS, fromPixel } from './hex.js';

export const TERRAIN = {
  BUILDABLE: 0,   // open ground: walkable and buildable
  BLOCKED: 1,     // void: neither walkable nor buildable
  PATH_ONLY: 2,   // walkable but not buildable (pre-carved corridor)
  SPAWN: 3,       // enemy entrance (walkable, not buildable)
  EXIT: 4,        // enemy goal (walkable, not buildable)
  PAD_POWER: 5,   // buildable; tower here gets bonus damage
  PAD_FOCUS: 6,   // buildable; tower here gets bonus range and fire rate
};

export const PAD_POWER_DAMAGE = 1.25;
export const PAD_FOCUS_RANGE = 1.2;
export const PAD_FOCUS_RATE = 1.2;

const BUILDABLE_TERRAIN = new Set([TERRAIN.BUILDABLE, TERRAIN.PAD_POWER, TERRAIN.PAD_FOCUS]);
const WALKABLE_TERRAIN = new Set([
  TERRAIN.BUILDABLE, TERRAIN.PATH_ONLY, TERRAIN.SPAWN, TERRAIN.EXIT,
  TERRAIN.PAD_POWER, TERRAIN.PAD_FOCUS,
]);

/**
 * Characters used by the text-art level maps. Authoring five maps as
 * coordinate lists would be miserable; this keeps them readable and editable.
 */
const LEGEND = {
  '.': TERRAIN.BUILDABLE,
  '#': TERRAIN.BLOCKED,
  ',': TERRAIN.PATH_ONLY,
  'o': TERRAIN.PAD_POWER,
  'p': TERRAIN.PAD_FOCUS,
  'X': TERRAIN.EXIT,
  // Spawn portals are 'A'..'D'; handled separately so we keep their labels.
};

export class Grid {
  constructor() {
    this.cells = new Map();     // key -> cell
    this.list = [];             // dense array for iteration
    this.spawns = [];           // [{ label, q, r, cell }]
    this.exits = [];            // [cell]
    this.size = 24;             // hex circumradius in px (set by layout())
    this.originX = 0;
    this.originY = 0;
  }

  /**
   * Parse a text-art map. Each string is one axial row `r`; character index is
   * an offset column that we convert to axial `q`. Odd columns visually drop
   * half a row, which the axial conversion handles for us.
   */
  static fromMap(rows) {
    const grid = new Grid();
    for (let row = 0; row < rows.length; row++) {
      const line = rows[row];
      for (let col = 0; col < line.length; col++) {
        const ch = line[col];
        if (ch === ' ') continue;               // outside the board
        // offset (col,row) -> axial, for flat-top "odd-q" style layout
        const q = col;
        const r = row - ((col - (col & 1)) >> 1);

        let terrain;
        let spawnLabel = null;
        if (ch >= 'A' && ch <= 'D') {
          terrain = TERRAIN.SPAWN;
          spawnLabel = ch;
        } else {
          terrain = LEGEND[ch];
          if (terrain === undefined) throw new Error(`Unknown map character '${ch}'`);
        }

        const cell = {
          q, r, k: key(q, r),
          idx: grid.list.length,
          terrain,
          tower: null,
          x: 0, y: 0,
          dist: Infinity,   // filled in by the flow field
          next: -1,
        };
        grid.cells.set(cell.k, cell);
        grid.list.push(cell);
        if (spawnLabel) grid.spawns.push({ label: spawnLabel, q, r, cell });
        if (terrain === TERRAIN.EXIT) grid.exits.push(cell);
      }
    }
    return grid;
  }

  at(q, r) { return this.cells.get(key(q, r)); }
  has(q, r) { return this.cells.has(key(q, r)); }

  /** Can a tower be built here right now? (Ignores pathing; see pathfield.) */
  isBuildable(cell) {
    return !!cell && cell.tower === null && BUILDABLE_TERRAIN.has(cell.terrain);
  }

  /** Is this cell walkable by ground enemies right now? */
  isWalkable(cell) {
    return !!cell && cell.tower === null && WALKABLE_TERRAIN.has(cell.terrain);
  }

  /** Walkable ignoring towers -- used for the trapped-enemy fallback. */
  isTerrainWalkable(cell) {
    return !!cell && WALKABLE_TERRAIN.has(cell.terrain);
  }

  isPad(cell) {
    return cell.terrain === TERRAIN.PAD_POWER || cell.terrain === TERRAIN.PAD_FOCUS;
  }

  /**
   * Fit the whole board inside `width` x `height` pixels and cache each cell's
   * screen position. The board never pans or zooms during play -- pinch-to-pan
   * fights tap-to-place on a phone -- so this runs only on resize.
   */
  layout(width, height, padding = 6, topInset = 0) {
    // Measure the board in "unit" space (size = 1) then solve for the size that
    // fits. A flat-top hex at size 1 is 2 wide and sqrt(3) tall.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of this.list) {
      const p = toPixel(c.q, c.r, 1);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const unitW = (maxX - minX) + 2;          // + full hex width
    const unitH = (maxY - minY) + Math.sqrt(3);
    const usableH = height - topInset;
    const size = Math.min(
      (width - padding * 2) / unitW,
      (usableH - padding * 2) / unitH,
    );
    this.size = size;
    // Centre the board in the viewport.
    const boardW = unitW * size;
    const boardH = unitH * size;
    this.originX = (width - boardW) / 2 - minX * size + size;
    this.originY = topInset + (usableH - boardH) / 2 - minY * size + (Math.sqrt(3) / 2) * size;

    for (const c of this.list) {
      const p = toPixel(c.q, c.r, this.size, this.originX, this.originY);
      c.x = p.x;
      c.y = p.y;
    }
    return size;
  }

  /** Screen point -> cell, or null if the point is off the board. */
  cellAtPixel(x, y) {
    const { q, r } = fromPixel(x, y, this.size, this.originX, this.originY);
    return this.cells.get(key(q, r)) || null;
  }

  /** Walkable neighbours of a cell, as cell objects (used by the flow field). */
  walkableNeighbors(cell, out = []) {
    out.length = 0;
    for (let d = 0; d < 6; d++) {
      const n = this.cells.get(key(cell.q + DIRECTIONS[d].q, cell.r + DIRECTIONS[d].r));
      if (n && this.isWalkable(n)) out.push(n);
    }
    return out;
  }
}
