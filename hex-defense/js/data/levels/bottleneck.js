// Level 2 -- Bottleneck.
// Void cells form natural chokepoints, so the map does half the mazing for
// you and the question becomes what to put in the gaps. The long straight
// corridors between the walls are where the Laser Lance earns its cost.

export default {
  id: 'bottleneck',
  name: 'Bottleneck',
  startCash: 80,
  health: 20,
  towers: ['pulse', 'laser', 'resonator'],
  map: [
    '....A....',
    '.........',
    '.##...##.',
    '.##...##.',
    '.........',
    '....o....',
    '.........',
    '##.....##',
    '##.....##',
    '.........',
    '..p...p..',
    '.........',
    '....X....',
  ],
  waves: [
    { break: 28, groups: [{ t: 'grunt', n: 8, gap: 0.8 }] },
    { break: 24, groups: [{ t: 'runner', n: 10, gap: 0.4 }] },
    { break: 24, groups: [{ t: 'grunt', n: 10, gap: 0.6 }, { t: 'swarm', n: 14, gap: 0.16, overlap: 2 }] },
    { break: 22, groups: [{ t: 'tank', n: 3, gap: 2.0 }, { t: 'runner', n: 8, gap: 0.4, overlap: 1.5 }] },
    { break: 22, groups: [{ t: 'shielded', n: 5, gap: 1.2 }] },
    { break: 20, groups: [{ t: 'swarm', n: 24, gap: 0.13 }, { t: 'grunt', n: 8, gap: 0.5, overlap: 2 }] },
    { break: 20, groups: [{ t: 'shielded', n: 6, gap: 0.9 }, { t: 'tank', n: 3, gap: 1.6, overlap: 2 }] },
    { break: 18, groups: [{ t: 'runner', n: 16, gap: 0.28 }] },
    { break: 18, groups: [{ t: 'tank', n: 6, gap: 1.2 }, { t: 'shielded', n: 6, gap: 0.8, overlap: 2 }] },
    { break: 18, groups: [{ t: 'grunt', n: 16, gap: 0.4 }, { t: 'swarm', n: 26, gap: 0.12, overlap: 2 }, { t: 'tank', n: 5, gap: 1.2, overlap: 2 }] },
  ],
};
