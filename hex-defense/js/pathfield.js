// Pathfinding for the maze.
//
// Maze TD re-paths on every single tower placement, and the placement preview
// needs to re-path continuously while a finger is dragging. Per-enemy A* would
// be far too expensive for that, so instead we compute ONE multi-source BFS
// from the exit(s) across the whole board. Every walkable cell learns its
// distance-to-exit and which of its six neighbours are on a shortest route.
//
// Enemies then just read their current cell -- O(1) per enemy per step, which
// scales to hundreds of them for free. It also hands us "distance to exit" for
// nothing, which is exactly the sort key for FIRST / LAST tower targeting.

import { key, DIRECTIONS } from './hex.js';

export class PathField {
  constructor(grid) {
    this.grid = grid;
    const n = grid.list.length;
    this.dist = new Int32Array(n);
    this.bestDirs = new Uint8Array(n);   // bitmask over the 6 directions
    // Scratch buffers reused by the hypothetical-placement check so that the
    // live drag preview never allocates.
    this.scratchDist = new Int32Array(n);
    this.queue = new Int32Array(n);
    // Distance to the exit over bare terrain, ignoring towers entirely.
    // Computed once per level and used to decide which tower a trapped enemy
    // should break through.
    this.openDist = new Int32Array(n);
    this._bfs(this.openDist, -1, true);
    this.compute();
  }

  /** Recompute the field. Called whenever the board changes. */
  compute() {
    const { grid, dist, bestDirs } = this;
    this._bfs(dist, -1);

    // Precompute, for each cell, the mask of neighbour directions that step
    // strictly closer to the exit. Storing a mask rather than a single "next"
    // lets a stream of identical enemies fan out across equal-length routes
    // instead of forming a single-file line.
    for (const c of grid.list) {
      let mask = 0;
      const d = dist[c.idx];
      if (d > 0 && d !== INF) {
        for (let dir = 0; dir < 6; dir++) {
          const n = grid.cells.get(key(c.q + DIRECTIONS[dir].q, c.r + DIRECTIONS[dir].r));
          if (n && grid.isWalkable(n) && dist[n.idx] === d - 1) mask |= (1 << dir);
        }
      }
      bestDirs[c.idx] = mask;
      c.dist = d === INF ? Infinity : d;
      c.bestDirs = mask;
    }
  }

  distanceOf(cell) {
    const d = this.dist[cell.idx];
    return d === INF ? Infinity : d;
  }

  reachable(cell) { return this.dist[cell.idx] !== INF; }

  /**
   * Pick a step direction out of `cell`. `seed` is a stable per-enemy value so
   * that a given enemy makes consistent choices but different enemies spread
   * across tied routes. Returns -1 if there is nowhere closer to go.
   */
  chooseDir(cell, seed) {
    const mask = this.bestDirs[cell.idx];
    if (mask === 0) return -1;
    let count = 0;
    for (let d = 0; d < 6; d++) if (mask & (1 << d)) count++;
    let pick = seed % count;
    for (let d = 0; d < 6; d++) {
      if (mask & (1 << d)) {
        if (pick === 0) return d;
        pick--;
      }
    }
    return -1;
  }

  /**
   * Would putting a tower on `cell` seal the board off?
   *
   * The rule is: you may not cut every active spawn portal off from an exit,
   * and you may not strand a living ground enemy. Rejecting the placement (with
   * a red ghost) is much kinder than letting the player spend money and then
   * discovering the consequence.
   *
   * `enemyCells` is the list of cells currently occupied by ground enemies.
   * Returns true if the placement is legal.
   */
  allowsPlacement(cell, activeSpawnCells, enemyCells) {
    const { grid, scratchDist } = this;
    this._bfs(scratchDist, cell.idx);

    for (const s of activeSpawnCells) {
      if (scratchDist[s.idx] === INF) return false;
    }
    for (const e of enemyCells) {
      if (e.idx === cell.idx) return false;              // standing right there
      if (scratchDist[e.idx] === INF) return false;      // would be walled in
    }
    return true;
  }

  /**
   * For a sealed-in enemy: which neighbouring tower stands between it and the
   * exit? We pick the neighbour whose bare-terrain distance to the exit is
   * lowest, which is the direction it "wants" to go. Falls back to any
   * neighbouring tower so a trapped enemy is never stuck with nothing to hit.
   */
  blockingNeighbor(cell) {
    const { grid, openDist } = this;
    let best = null, bestD = Infinity, fallback = null;
    for (let dir = 0; dir < 6; dir++) {
      const n = grid.cells.get(key(cell.q + DIRECTIONS[dir].q, cell.r + DIRECTIONS[dir].r));
      if (!n || !n.tower) continue;
      fallback = n;
      const d = openDist[n.idx];
      if (d < bestD) { bestD = d; best = n; }
    }
    return best || fallback;
  }

  /**
   * Multi-source BFS from every exit, over cells that are walkable now.
   * `blockIdx` optionally treats one extra cell as solid (the placement probe).
   */
  _bfs(out, blockIdx, ignoreTowers = false) {
    const { grid, queue } = this;
    out.fill(INF);
    let head = 0, tail = 0;

    for (const exit of grid.exits) {
      if (exit.idx === blockIdx) continue;
      out[exit.idx] = 0;
      queue[tail++] = exit.idx;
    }

    while (head < tail) {
      const ci = queue[head++];
      const c = grid.list[ci];
      const nd = out[ci] + 1;
      for (let dir = 0; dir < 6; dir++) {
        const n = grid.cells.get(key(c.q + DIRECTIONS[dir].q, c.r + DIRECTIONS[dir].r));
        if (!n || n.idx === blockIdx) continue;
        if (ignoreTowers ? !grid.isTerrainWalkable(n) : !grid.isWalkable(n)) continue;
        if (out[n.idx] <= nd) continue;
        out[n.idx] = nd;
        queue[tail++] = n.idx;
      }
    }
  }
}

const INF = 0x7fffffff;
