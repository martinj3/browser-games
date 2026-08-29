// Enemy definitions.
//
// `hp` is a multiplier on the generated health curve (see constants.js), not an
// absolute value -- wave tables specify composition, the curve specifies scale.
// `speed` is in hexes per second. `armor` is FLAT damage reduction, not a
// percentage, which is what makes cheap fast towers fall off against Tanks and
// gives the Mortar a clear identity.

export const ENEMIES = [
  {
    id: 'grunt',
    name: 'Grunt',
    hp: 1, speed: 1.6, armor: 0, reward: 3, score: 1,
    color: 0x63ff9b, shape: 'circle', radius: 0.42,
  },
  {
    id: 'runner',
    name: 'Runner',
    hp: 0.45, speed: 3.4, armor: 0, reward: 3, score: 1.5,
    color: 0xff67c8, shape: 'star', radius: 0.34,
  },
  {
    id: 'tank',
    name: 'Tank',
    hp: 4.6, speed: 0.95, armor: 6, reward: 11, score: 4,
    color: 0xff6a4d, shape: 'blob', radius: 0.55,
  },
  {
    id: 'swarm',
    name: 'Swarmling',
    hp: 0.22, speed: 2.2, armor: 0, reward: 1, score: 0.5,
    color: 0x8dfff0, shape: 'dot', radius: 0.22,
  },
  {
    id: 'shielded',
    name: 'Shielded',
    // The shield absorbs a pool of damage and recharges after a lull, which
    // punishes slow single shots and rewards sustained fire.
    hp: 1.6, speed: 1.5, armor: 1, reward: 7, score: 3,
    shield: 0.9, shieldRecharge: 2.0, shieldRate: 0.45,
    color: 0x4db4ff, shape: 'shieldhex', radius: 0.46,
  },
  {
    id: 'flyer',
    name: 'Flyer',
    // Ignores the maze completely and flies straight to the exit. Without this,
    // one perfect ground maze would be the answer to every level.
    hp: 1.1, speed: 1.85, armor: 0, reward: 5, score: 3,
    flying: true,
    color: 0x59d2ff, shape: 'pac', radius: 0.4,
  },
  {
    id: 'splitter',
    name: 'Splitter',
    hp: 2.2, speed: 1.35, armor: 2, reward: 6, score: 3,
    splitInto: { type: 'splitterling', count: 3 },
    color: 0xffe14d, shape: 'cluster', radius: 0.5,
  },
  {
    id: 'splitterling',
    name: 'Splinter',
    hp: 0.4, speed: 2.4, armor: 0, reward: 1, score: 0.5,
    color: 0xfff5a8, shape: 'dot', radius: 0.24,
    internal: true,     // never spawned directly by a wave
  },
  {
    id: 'phaser',
    name: 'Phaser',
    // Untargetable in bursts, so towers must have enough uptime to catch it.
    hp: 1.5, speed: 2.0, armor: 0, reward: 7, score: 4,
    phase: { on: 1.0, off: 1.6 },
    color: 0xc39bff, shape: 'phase', radius: 0.4,
  },
  {
    id: 'boss',
    name: 'Hive Core',
    hp: 34, speed: 0.75, armor: 10, reward: 90, score: 40,
    boss: true, slowImmune: true,
    auraRange: 2, auraReduction: 0.35,   // nearby enemies take 35% less damage
    color: 0xff2f6a, shape: 'boss', radius: 0.78,
  },
];

export const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));
