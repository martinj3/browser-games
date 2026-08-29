// Every gameplay-affecting number lives here so balance can be tuned without
// hunting through system files.

// --- Simulation -------------------------------------------------------------
export const TICK = 1 / 60;              // fixed simulation step, seconds
export const MAX_FRAME_TIME = 0.25;      // clamp on real delta, to survive tab-outs
export const SPEEDS = [1, 2, 3];         // fast-forward multipliers

// --- Economy ----------------------------------------------------------------
export const SELL_REFUND = 0.5;          // fraction of total invested returned
export const WAVE_CLEAR_BONUS = 12;      // base cash for finishing a wave
export const WAVE_CLEAR_BONUS_GROWTH = 4;// extra per wave index
export const EARLY_SEND_CASH_PER_SEC = 1.1;

// --- Health -----------------------------------------------------------------
export const LEAK_DAMAGE = 1;
export const BOSS_LEAK_DAMAGE = 5;

// --- Scoring ----------------------------------------------------------------
export const SCORE_PER_KILL = 10;
export const COMBO_DECAY_TIME = 2.2;     // seconds of no kills before the multiplier drops
export const COMBO_DECAY_RATE = 0.55;    // fraction of the multiplier lost per second, once decaying
export const COMBO_MAX = 9999;

// --- Enemy health curve -----------------------------------------------------
// Health is generated from a curve rather than hand-tuned per wave; the wave
// tables then only specify composition, which is the interesting part.
export const BASE_HP = 20;
export const WAVE_HP_GROWTH = 1.16;      // within a level
export const LEVEL_HP_SCALE = [1, 1.35, 1.8, 2.4, 3.1];

// --- Movement ---------------------------------------------------------------
// Enemy speeds are in hexes per second; one "hex" of travel is the centre-to-
// centre distance between neighbours.
export const SPAWN_APPROACH_TIME = 0.6;  // seconds spent flying in from off-board

// --- Enraged / trapped behaviour --------------------------------------------
// An enemy with no route to an exit walks to the tower blocking its way and
// destroys it in one hit. The wind-up gives the player a beat to see why they
// are about to lose a tower.
export const ENRAGE_WINDUP = 0.55;

// --- Towers -----------------------------------------------------------------
export const MAX_TOWER_LEVEL = 5;
export const UPGRADE_COST_GROWTH = 1.6;  // cost = round(base * growth^level)
export const UPGRADE_DAMAGE = 1.35;      // multiplicative per level
export const UPGRADE_RATE = 1.12;        // multiplicative per level
// Range is measured in whole hexes, so it steps rather than scaling smoothly.
export const UPGRADE_RANGE_STEPS = [0, 0, 1, 1, 2];

// --- Presentation -----------------------------------------------------------
export const SHAKE_DECAY = 5.5;
export const MAX_SHAKE = 22;
export const INTENSITY_DECAY = 1.6;      // how fast the global "carnage" value falls
export const INTENSITY_MAX = 1;

// Tiers never touch filter resolution -- see postfx.js. They trade blur width,
// blur passes, particle count and screen-warping effects instead, so the board
// stays pixel-crisp on every device.
export const QUALITY = {
  HIGH:   { particles: 2600, bloom: true,  bloomQuality: 4, bloomPixelSize: 1, shockwaves: 3, aberration: true },
  MEDIUM: { particles: 1400, bloom: true,  bloomQuality: 2, bloomPixelSize: 2, shockwaves: 2, aberration: true },
  LOW:    { particles: 600,  bloom: false, bloomQuality: 1, bloomPixelSize: 3, shockwaves: 0, aberration: false },
};

// --- Palette ----------------------------------------------------------------
export const COLORS = {
  bg: 0x00060a,
  gridLine: 0x1c8f7e,
  gridFill: 0x03181c,
  gridBuildable: 0x0d4a45,
  padPower: 0xd9791a,
  padFocus: 0x8b3fd6,
  spawn: 0x2ad46a,
  exit: 0xff2f4a,
  ghostOk: 0x5cffb0,
  ghostBad: 0xff3355,
  range: 0x6effc8,
  white: 0xffffff,
};
