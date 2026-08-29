// Level 5 -- Crucible.
// A big open arena with two entrances, almost no terrain to lean on and every
// enemy type in the game. Pure maze skill, finished by a Hive Core that shrugs
// off slows and shields everything around it. The Prism unlocks here.

export default {
  id: 'crucible',
  name: 'Crucible',
  startCash: 150,
  health: 20,
  towers: ['pulse', 'laser', 'resonator', 'cryo', 'tesla', 'mortar', 'prism'],
  map: [
    '.A.......B.',
    '...........',
    '....###....',
    '...........',
    '..o.....o..',
    '...........',
    '...#...#...',
    '...........',
    '..p.....p..',
    '...........',
    '.....#.....',
    '...........',
    '.....X.....',
  ],
  waves: [
    { break: 24, portals: ['A'], groups: [{ t: 'grunt', n: 12, gap: 0.5 }] },
    { break: 22, portals: ['B'], groups: [{ t: 'runner', n: 16, gap: 0.28 }] },
    { break: 22, portals: ['A'], groups: [{ t: 'tank', n: 5, gap: 1.4 }, { t: 'grunt', n: 10, gap: 0.45, overlap: 2 }] },
    { break: 20, portals: ['B'], groups: [{ t: 'flyer', n: 10, gap: 0.6 }] },
    { break: 20, portals: ['A', 'B'], groups: [{ t: 'swarm', n: 36, gap: 0.09 }] },
    { break: 18, portals: ['A'], groups: [{ t: 'shielded', n: 10, gap: 0.7 }, { t: 'phaser', n: 8, gap: 0.6, overlap: 2 }] },
    { break: 18, portals: ['B'], groups: [{ t: 'splitter', n: 10, gap: 0.9 }] },
    { break: 18, portals: ['A', 'B'], groups: [{ t: 'tank', n: 10, gap: 0.9 }, { t: 'flyer', n: 10, gap: 0.55, overlap: 2 }] },
    { break: 16, portals: ['A'], groups: [{ t: 'phaser', n: 14, gap: 0.45 }, { t: 'runner', n: 16, gap: 0.25, overlap: 2 }] },
    { break: 16, portals: ['B'], groups: [{ t: 'shielded', n: 12, gap: 0.6 }, { t: 'splitter', n: 8, gap: 0.9, overlap: 2 }] },
    { break: 16, portals: ['A', 'B'], groups: [{ t: 'swarm', n: 44, gap: 0.08 }, { t: 'tank', n: 8, gap: 1.0, overlap: 2 }] },
    { break: 14, portals: ['A', 'B'], groups: [{ t: 'flyer', n: 16, gap: 0.4 }, { t: 'phaser', n: 12, gap: 0.45, overlap: 2 }] },
    { break: 14, portals: ['A', 'B'], groups: [{ t: 'tank', n: 12, gap: 0.8 }, { t: 'shielded', n: 12, gap: 0.55, overlap: 2 }, { t: 'splitter', n: 10, gap: 0.8, overlap: 2 }] },
    { break: 14, portals: ['A', 'B'], groups: [{ t: 'runner', n: 24, gap: 0.2 }, { t: 'swarm', n: 44, gap: 0.08, overlap: 2 }, { t: 'phaser', n: 14, gap: 0.4, overlap: 2 }] },
    { break: 12, portals: ['A', 'B'], boss: true, groups: [{ t: 'boss', n: 1, gap: 1 }, { t: 'tank', n: 10, gap: 0.9, overlap: 1 }, { t: 'flyer', n: 14, gap: 0.5, overlap: 1 }, { t: 'swarm', n: 40, gap: 0.08, overlap: 2 }] },
  ],
};
