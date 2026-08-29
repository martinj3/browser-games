// Flat-top hexagon math on axial coordinates (q, r).
//
// Flat-top means each hex has a flat top and bottom edge and vertices pointing
// left and right. Columns line up vertically, so the six neighbours are
// N, NE, SE, S, SW, NW -- which gives direct north/south movement, the axis a
// portrait phone screen cares about.
//
// This module is pure math: no rendering, no game state, no imports.

/** Neighbour offsets in axial (q, r), in clockwise order starting at north. */
export const DIRECTIONS = [
  { q: 0, r: -1 },  // 0 N
  { q: 1, r: -1 },  // 1 NE
  { q: 1, r: 0 },   // 2 SE
  { q: 0, r: 1 },   // 3 S
  { q: -1, r: 1 },  // 4 SW
  { q: -1, r: 0 },  // 5 NW
];

/** Pack an axial coordinate into a single integer key for Map/Set use. */
export function key(q, r) {
  return ((q + 512) << 10) | (r + 512);
}

export function unkey(k) {
  return { q: ((k >> 10) & 1023) - 512, r: (k & 1023) - 512 };
}

export function neighbor(q, r, dir) {
  const d = DIRECTIONS[dir];
  return { q: q + d.q, r: r + d.r };
}

/** Distance in hex steps between two axial coordinates. */
export function distance(aq, ar, bq, br) {
  const dq = aq - bq;
  const dr = ar - br;
  // Third cube axis: s = -q - r
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

// --- Layout -----------------------------------------------------------------
//
// `size` is the hex's circumradius (centre to vertex). For flat-top hexes the
// full width is 2*size and the full height is sqrt(3)*size, columns advance by
// 1.5*size horizontally and each odd column drops half a row.

export const SQRT3 = Math.sqrt(3);

export function hexWidth(size) { return 2 * size; }
export function hexHeight(size) { return SQRT3 * size; }

/** Horizontal spacing between adjacent columns. */
export function columnStep(size) { return 1.5 * size; }

export function toPixel(q, r, size, originX = 0, originY = 0) {
  return {
    x: originX + size * 1.5 * q,
    y: originY + size * SQRT3 * (r + q / 2),
  };
}

/** Inverse of toPixel, with proper cube rounding so edges resolve correctly. */
export function fromPixel(x, y, size, originX = 0, originY = 0) {
  const px = (x - originX) / size;
  const py = (y - originY) / size;
  const q = (2 / 3) * px;
  const r = py / SQRT3 - px / 3;
  return roundAxial(q, r);
}

/** Round fractional axial coordinates to the nearest hex (via cube rounding). */
export function roundAxial(qf, rf) {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  let s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

/** The six corner offsets of a flat-top hex of the given size, in order. */
export function corners(size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    pts.push({ x: size * Math.cos(angle), y: size * Math.sin(angle) });
  }
  return pts;
}

/**
 * All cells whose distance from (cq, cr) is within [minR, maxR].
 * Used to precompute a tower's target set once at placement/upgrade time
 * instead of scanning every enemy every frame.
 */
export function cellsInRange(cq, cr, maxR, minR = 0) {
  const out = [];
  for (let dq = -maxR; dq <= maxR; dq++) {
    const lo = Math.max(-maxR, -dq - maxR);
    const hi = Math.min(maxR, -dq + maxR);
    for (let dr = lo; dr <= hi; dr++) {
      const d = distance(0, 0, dq, dr);
      if (d >= minR && d <= maxR) out.push({ q: cq + dq, r: cr + dr });
    }
  }
  return out;
}

/** The straight run of `length` cells starting one step from origin in `dir`. */
export function lineOfHexes(q, r, dir, length) {
  const d = DIRECTIONS[dir];
  const out = [];
  for (let i = 1; i <= length; i++) out.push({ q: q + d.q * i, r: r + d.r * i });
  return out;
}

/** Midpoint of the edge shared between a hex centre and its neighbour in `dir`. */
export function edgeMidpoint(cx, cy, dir, size) {
  const n = DIRECTIONS[dir];
  const nx = cx + size * 1.5 * n.q;
  const ny = cy + size * SQRT3 * (n.r + n.q / 2);
  return { x: (cx + nx) / 2, y: (cy + ny) / 2 };
}
