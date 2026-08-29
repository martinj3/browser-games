// Procedural neon sprite bakery.
//
// Every sprite in the game is drawn once at boot with Canvas 2D -- including the
// soft outer halo, baked in with shadowBlur -- and handed to Pixi as a texture.
// At runtime they are just tinted, batched sprites, so the expensive part of the
// glow costs nothing per frame. It also means the repo ships no image files and
// everything scales to the device's pixel ratio.

import { Texture } from 'pixi.js';

const SIZE = 96;          // entity texture size in px
const GLOW_SIZE = 128;

export const textures = {};
/** The raw source canvases, kept so the DOM HUD can reuse the same artwork. */
export const canvases = {};

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/**
 * Stroke a path twice: a wide, blurred, coloured pass for the halo, then a
 * crisp near-white pass for the core. That double-draw is most of the neon look
 * and it survives being scaled down far better than a post-process filter does.
 */
function neon(ctx, draw, { width = 4, blur = 14, fill = false } = {}) {
  ctx.save();
  ctx.shadowColor = 'rgba(255,255,255,0.95)';
  ctx.shadowBlur = blur;
  ctx.strokeStyle = 'rgba(255,255,255,0.42)';
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = width * 1.9;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  if (fill) ctx.fill();
  ctx.stroke();

  // Core pass: bright but not saturated, so the tint still reads after bloom.
  ctx.shadowBlur = blur * 0.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = width;
  draw(ctx);
  ctx.stroke();
  ctx.restore();
}

function polygon(ctx, cx, cy, r, sides, rotation = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function starPath(ctx, cx, cy, outer, inner, points, rotation = 0) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// --- Soft blobs -------------------------------------------------------------

function buildGlow() {
  const c = makeCanvas(GLOW_SIZE);
  const g = c.getContext('2d');
  const r = GLOW_SIZE / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  return c;
}

function buildSpark() {
  const c = makeCanvas(32);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return c;
}

/** A short tapered streak, used for death-burst shards and bullet trails. */
function buildShard() {
  const c = makeCanvas(64);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 32, 64, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 32); g.lineTo(32, 27); g.lineTo(64, 32); g.lineTo(32, 37);
  g.closePath(); g.fill();
  return c;
}

function buildRing() {
  const c = makeCanvas(GLOW_SIZE);
  const g = c.getContext('2d');
  const r = GLOW_SIZE / 2;
  neon(g, (x) => { x.beginPath(); x.arc(r, r, r - 12, 0, Math.PI * 2); }, { width: 4, blur: 12 });
  return c;
}

// --- Enemies ----------------------------------------------------------------

const ENEMY_SHAPES = {
  circle(g, c, r) {
    neon(g, (x) => { x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); }, { width: 5, blur: 16, fill: true });
    neon(g, (x) => { x.beginPath(); x.moveTo(c - r * 0.55, c); x.lineTo(c + r * 0.55, c); }, { width: 4, blur: 10 });
  },
  star(g, c, r) {
    neon(g, (x) => starPath(x, c, c, r, r * 0.45, 5), { width: 4, blur: 16, fill: true });
  },
  blob(g, c, r) {
    neon(g, (x) => polygon(x, c, c, r, 8, Math.PI / 8), { width: 5, blur: 18, fill: true });
    neon(g, (x) => polygon(x, c, c, r * 0.5, 4, Math.PI / 4), { width: 4, blur: 10 });
  },
  dot(g, c, r) {
    neon(g, (x) => { x.beginPath(); x.arc(c, c, r * 0.8, 0, Math.PI * 2); }, { width: 5, blur: 14, fill: true });
  },
  shieldhex(g, c, r) {
    neon(g, (x) => polygon(x, c, c, r * 0.72, 6), { width: 5, blur: 14, fill: true });
    neon(g, (x) => { x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); }, { width: 3, blur: 16 });
  },
  pac(g, c, r) {
    // A wedge-mouthed disc -- the flyer silhouette from the reference shots.
    neon(g, (x) => {
      x.beginPath();
      x.arc(c, c, r, Math.PI * 0.30, Math.PI * 1.70);
      x.lineTo(c, c);
      x.closePath();
    }, { width: 5, blur: 16, fill: true });
  },
  cluster(g, c, r) {
    for (const [dx, dy] of [[-0.42, -0.3], [0.42, -0.3], [0, 0.45]]) {
      neon(g, (x) => { x.beginPath(); x.arc(c + dx * r * 1.5, c + dy * r * 1.5, r * 0.52, 0, Math.PI * 2); },
        { width: 4, blur: 12, fill: true });
    }
  },
  phase(g, c, r) {
    neon(g, (x) => { x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); }, { width: 3, blur: 18 });
    neon(g, (x) => polygon(x, c, c, r * 0.55, 3, -Math.PI / 2), { width: 4, blur: 12, fill: true });
  },
  boss(g, c, r) {
    neon(g, (x) => polygon(x, c, c, r, 6), { width: 6, blur: 22, fill: true });
    neon(g, (x) => polygon(x, c, c, r * 0.62, 6, Math.PI / 6), { width: 4, blur: 14 });
    neon(g, (x) => { x.beginPath(); x.arc(c, c, r * 0.26, 0, Math.PI * 2); }, { width: 5, blur: 16, fill: true });
  },
};

// --- Towers -----------------------------------------------------------------
//
// Every tower is a glowing ring token with its own glyph inside, so they read as
// a family on a busy board and are told apart by silhouette rather than colour
// alone. Glyphs point right (0 rad); the sprite is rotated to aim.

const TOWER_GLYPHS = {
  barrel(g, c, r) {
    // A stubby cannon: short, fat, unmistakable at thumbnail size.
    neon(g, (x) => { x.beginPath(); x.moveTo(c - r * 0.3, c); x.lineTo(c + r * 0.95, c); }, { width: 9, blur: 12 });
  },
  lance(g, c, r) {
    // A long thin emitter with a crossbar -- reads as "beam", not "gun".
    neon(g, (x) => { x.beginPath(); x.moveTo(c - r * 0.85, c); x.lineTo(c + r * 1.05, c); }, { width: 3, blur: 14 });
    neon(g, (x) => { x.beginPath(); x.moveTo(c - r * 0.1, c - r * 0.55); x.lineTo(c - r * 0.1, c + r * 0.55); }, { width: 3, blur: 10 });
  },
  ring(g, c, r) {
    neon(g, (x) => { x.beginPath(); x.arc(c, c, r * 0.5, 0, Math.PI * 2); }, { width: 5, blur: 12 });
    neon(g, (x) => { x.beginPath(); x.arc(c, c, r * 0.22, 0, Math.PI * 2); }, { width: 4, blur: 10, fill: true });
  },
  mortar(g, c, r) {
    neon(g, (x) => {
      x.beginPath();
      x.moveTo(c - r * 0.45, c - r * 0.42); x.lineTo(c + r * 0.55, c);
      x.lineTo(c - r * 0.45, c + r * 0.42); x.closePath();
    }, { width: 5, blur: 14, fill: true });
  },
  coil(g, c, r) {
    for (let i = 0; i < 3; i++) {
      const rr = r * (0.28 + i * 0.2);
      neon(g, (x) => { x.beginPath(); x.arc(c, c, rr, -0.9, 0.9); }, { width: 4, blur: 10 });
    }
    neon(g, (x) => { x.beginPath(); x.moveTo(c, c - r * 0.6); x.lineTo(c, c + r * 0.6); }, { width: 3, blur: 10 });
  },
  snow(g, c, r) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      neon(g, (x) => {
        x.beginPath();
        x.moveTo(c - Math.cos(a) * r * 0.62, c - Math.sin(a) * r * 0.62);
        x.lineTo(c + Math.cos(a) * r * 0.62, c + Math.sin(a) * r * 0.62);
      }, { width: 4, blur: 12 });
    }
  },
  prism(g, c, r) {
    neon(g, (x) => polygon(x, c, c, r * 0.62, 3, -Math.PI / 2), { width: 5, blur: 16 });
    neon(g, (x) => polygon(x, c, c, r * 0.62, 3, Math.PI / 2), { width: 5, blur: 16 });
  },
};

function buildTower(shape) {
  const c = makeCanvas(SIZE);
  const g = c.getContext('2d');
  const mid = SIZE / 2;
  const r = SIZE * 0.34;
  // A circular hull, deliberately NOT a hexagon: a tower needs to read as an
  // object standing on the lattice, not as a filled-in cell.
  neon(g, (x) => { x.beginPath(); x.arc(mid, mid, r, 0, Math.PI * 2); }, { width: 3.5, blur: 16, fill: true });
  TOWER_GLYPHS[shape](g, mid, r);
  return c;
}

function buildEnemy(shape) {
  const c = makeCanvas(SIZE);
  const g = c.getContext('2d');
  ENEMY_SHAPES[shape](g, SIZE / 2, SIZE * 0.34);
  return c;
}

/** Flat-top hexagon outline, used for cell highlights and the placement ghost. */
function buildHex() {
  const c = makeCanvas(SIZE);
  const g = c.getContext('2d');
  neon(g, (x) => polygon(x, SIZE / 2, SIZE / 2, SIZE * 0.42, 6), { width: 4, blur: 14 });
  return c;
}

function buildHexFill() {
  const c = makeCanvas(SIZE);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.85)';
  polygon(g, SIZE / 2, SIZE / 2, SIZE * 0.44, 6);
  g.fill();
  return c;
}

let built = false;

/** Bake everything. Idempotent; safe to call on every level start. */
export function buildTextures() {
  if (built) return textures;
  built = true;

  textures.glow = Texture.from(buildGlow());
  textures.spark = Texture.from(buildSpark());
  textures.shard = Texture.from(buildShard());
  textures.ring = Texture.from(buildRing());
  textures.hex = Texture.from(buildHex());
  textures.hexFill = Texture.from(buildHexFill());

  for (const shape of Object.keys(ENEMY_SHAPES)) {
    const c = buildEnemy(shape);
    canvases['enemy_' + shape] = c;
    textures['enemy_' + shape] = Texture.from(c);
  }
  for (const shape of Object.keys(TOWER_GLYPHS)) {
    const c = buildTower(shape);
    canvases['tower_' + shape] = c;
    textures['tower_' + shape] = Texture.from(c);
  }
  return textures;
}

export const TEXTURE_SIZE = SIZE;
