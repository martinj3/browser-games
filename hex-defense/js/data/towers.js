// Tower definitions.
//
// Each tower is data plus one of a small set of firing primitives, so we aren't
// writing bespoke combat code seven times over. `combat.js` implements the
// primitives; this file only describes stats and identity.
//
// `range` and `minRange` are in whole hexes. Damage is per shot.
//
// `short` is the name shown under the palette icon -- the full name does not fit
// once seven towers share a phone's width -- and `blurb` is the one-line
// description shown in the dock whenever a tower is armed.

export const TARGETING = {
  FIRST: 'first',       // furthest along the path (lowest distance-to-exit)
  STRONGEST: 'strongest',
  CLUSTER: 'cluster',   // the target with the most other enemies near it
};

export const TOWERS = [
  {
    id: 'pulse',
    name: 'Pulse Gun',
    short: 'Pulse',
    blurb: 'Sprays fast pellets. Short reach, cheap enough to build walls from.',
    cost: 8,
    // Small, fast, physical pellets rather than an instant hit: at this fire
    // rate a hitscan tracer read as a second laser beam, which made the two
    // cheapest towers look identical in play.
    primitive: 'rapidPellet',
    damage: 3.5,
    cooldown: 0.2,
    range: 2,
    pelletSpeed: 12,      // hexes per second -- fast, but visibly in flight
    targeting: TARGETING.FIRST,
    hitsAir: true,
    color: 0x5cff8f,
    shape: 'barrel',
  },
  {
    id: 'laser',
    name: 'Laser Lance',
    short: 'Laser',
    blurb: 'Instant beam down a hex line. Hits every enemy it crosses.',
    cost: 30,
    primitive: 'hitscanLine',
    damage: 24,
    cooldown: 1.35,
    range: 5,
    targeting: TARGETING.FIRST,
    hitsAir: true,
    color: 0x39d7ff,
    shape: 'lance',
  },
  {
    id: 'resonator',
    name: 'Resonator',
    short: 'Thump',
    blurb: 'Shockrings hit everything close by. Cannot reach air.',
    cost: 20,
    primitive: 'auraPulse',
    damage: 9,
    cooldown: 0.85,
    range: 2,
    targeting: null,
    hitsAir: false,
    color: 0xff5ce0,
    shape: 'ring',
  },
  {
    id: 'mortar',
    name: 'Mortar',
    short: 'Mortar',
    blurb: 'Arcing splash shells. Blind up close. Ground only.',
    cost: 45,
    primitive: 'projectileSplash',
    damage: 52,
    cooldown: 2.1,
    range: 5,
    minRange: 2,
    splash: 1.4,          // in hexes
    shellSpeed: 7.5,      // hexes per second
    targeting: TARGETING.CLUSTER,
    hitsAir: false,
    color: 0xffc23d,
    shape: 'mortar',
  },
  {
    id: 'tesla',
    name: 'Tesla Coil',
    short: 'Tesla',
    blurb: 'Arcs between nearby enemies. Shreds swarms.',
    cost: 35,
    primitive: 'chain',
    damage: 17,
    cooldown: 0.9,
    range: 3,
    chainCount: 4,
    chainFalloff: 0.68,
    chainRange: 2,
    targeting: TARGETING.FIRST,
    hitsAir: true,
    color: 0xbb8cff,
    shape: 'coil',
  },
  {
    id: 'cryo',
    name: 'Cryo Emitter',
    short: 'Cryo',
    blurb: 'Barely scratches, but slows everything in reach.',
    cost: 25,
    primitive: 'auraPulse',
    damage: 2,
    cooldown: 0.5,
    range: 2,
    slow: { factor: 0.5, duration: 1.3 },
    targeting: null,
    hitsAir: true,
    color: 0x7ce8ff,
    shape: 'snow',
  },
  {
    id: 'prism',
    name: 'Prism',
    short: 'Prism',
    blurb: 'Homing volleys that ignore armour entirely.',
    cost: 90,
    primitive: 'multiHoming',
    damage: 15,
    cooldown: 0.6,
    range: 4,
    shots: 3,
    boltSpeed: 11,
    ignoresArmor: true,
    targeting: TARGETING.FIRST,
    hitsAir: true,
    color: 0xffffff,
    rainbow: true,
    shape: 'prism',
  },
];

export const TOWER_BY_ID = Object.fromEntries(TOWERS.map((t) => [t.id, t]));
