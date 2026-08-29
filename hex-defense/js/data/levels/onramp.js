// Level 1 -- Onramp.
// Small, open, one entrance and one exit, generous cash. This is where the
// player learns place -> maze -> upgrade -> sell, so nothing here fights back
// very hard and there is plenty of room to make (and undo) mistakes.

export default {
  id: 'onramp',
  name: 'Onramp',
  startCash: 70,
  health: 20,
  towers: ['pulse', 'laser'],
  map: [
    '....A....',
    '.........',
    '.........',
    '...o.o...',
    '.........',
    '.........',
    '..#...#..',
    '.........',
    '.........',
    '...p.p...',
    '.........',
    '.........',
    '....X....',
  ],
  waves: [
    { break: 30, groups: [{ t: 'grunt', n: 6, gap: 1.0 }] },
    { break: 26, groups: [{ t: 'grunt', n: 9, gap: 0.8 }] },
    { break: 24, groups: [{ t: 'grunt', n: 6, gap: 0.7 }, { t: 'runner', n: 4, gap: 0.5, overlap: 2 }] },
    { break: 24, groups: [{ t: 'runner', n: 10, gap: 0.45 }] },
    { break: 22, groups: [{ t: 'grunt', n: 10, gap: 0.6 }, { t: 'swarm', n: 12, gap: 0.18, overlap: 2.5 }] },
    { break: 22, groups: [{ t: 'tank', n: 2, gap: 2.2 }, { t: 'grunt', n: 8, gap: 0.5, overlap: 1.5 }] },
    { break: 20, groups: [{ t: 'runner', n: 12, gap: 0.35 }, { t: 'tank', n: 3, gap: 1.8, overlap: 2 }] },
    { break: 20, groups: [{ t: 'grunt', n: 14, gap: 0.45 }, { t: 'tank', n: 4, gap: 1.4, overlap: 2 }, { t: 'swarm', n: 16, gap: 0.15, overlap: 2 }] },
  ],
};
