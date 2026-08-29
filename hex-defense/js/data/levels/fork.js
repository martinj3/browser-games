// Level 3 -- Fork.
// Two entrances that alternate wave by wave and converge on one exit, so a
// single perfect maze in one corner is no longer enough. Flyers arrive here
// too, which is the first time a pure ground maze stops being the answer.

export default {
  id: 'fork',
  name: 'Fork',
  startCash: 95,
  health: 20,
  towers: ['pulse', 'laser', 'resonator', 'cryo', 'tesla'],
  map: [
    '.A.......B.',
    '...........',
    '...........',
    '..##...##..',
    '..##...##..',
    '...........',
    '....o.o....',
    '...........',
    '.#.......#.',
    '.#.......#.',
    '...........',
    '....p.p....',
    '...........',
    '...........',
    '.....X.....',
  ],
  waves: [
    { break: 28, portals: ['A'], groups: [{ t: 'grunt', n: 9, gap: 0.7 }] },
    { break: 24, portals: ['B'], groups: [{ t: 'runner', n: 12, gap: 0.38 }] },
    { break: 24, portals: ['A'], groups: [{ t: 'grunt', n: 10, gap: 0.55 }, { t: 'swarm', n: 16, gap: 0.15, overlap: 2 }] },
    { break: 22, portals: ['B'], groups: [{ t: 'flyer', n: 6, gap: 1.0 }] },
    { break: 22, portals: ['A'], groups: [{ t: 'tank', n: 4, gap: 1.7 }, { t: 'grunt', n: 10, gap: 0.5, overlap: 1.5 }] },
    { break: 20, portals: ['A', 'B'], groups: [{ t: 'runner', n: 14, gap: 0.3 }] },
    { break: 20, portals: ['B'], groups: [{ t: 'shielded', n: 7, gap: 0.9 }, { t: 'flyer', n: 5, gap: 1.0, overlap: 2 }] },
    { break: 20, portals: ['A'], groups: [{ t: 'splitter', n: 5, gap: 1.4 }] },
    { break: 18, portals: ['A', 'B'], groups: [{ t: 'swarm', n: 30, gap: 0.11 }, { t: 'tank', n: 4, gap: 1.4, overlap: 2 }] },
    { break: 18, portals: ['B'], groups: [{ t: 'flyer', n: 10, gap: 0.55 }, { t: 'shielded', n: 6, gap: 0.8, overlap: 2 }] },
    { break: 16, portals: ['A'], groups: [{ t: 'splitter', n: 7, gap: 1.1 }, { t: 'runner', n: 14, gap: 0.28, overlap: 2 }] },
    { break: 16, portals: ['A', 'B'], groups: [{ t: 'tank', n: 7, gap: 1.1 }, { t: 'flyer', n: 9, gap: 0.6, overlap: 2 }, { t: 'swarm', n: 30, gap: 0.1, overlap: 2 }] },
  ],
};
