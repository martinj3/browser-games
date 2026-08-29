// Level 4 -- Serpentine.
// Alternating walls force a long switchback route, so this is less a maze and
// more a placement puzzle: you cannot lengthen the path much, you can only
// decide what stands beside it. Armour shows up in force, which is the Mortar's
// cue -- and the Mortar's dead zone up close makes those narrow lanes awkward.

export default {
  id: 'spiral',
  name: 'Serpentine',
  startCash: 120,
  health: 20,
  towers: ['pulse', 'laser', 'resonator', 'cryo', 'tesla', 'mortar'],
  // Two-row bands between the walls: one row for the enemy to walk, one to
  // build in. A single-row corridor would leave nowhere to put a tower at all.
  map: [
    '....A....',
    '.........',
    '.........',
    '########.',
    '..o......',
    '.........',
    '.########',
    '......p..',
    '.........',
    '########.',
    '.........',
    '....X....',
  ],
  waves: [
    { break: 26, groups: [{ t: 'grunt', n: 10, gap: 0.6 }] },
    { break: 24, groups: [{ t: 'tank', n: 4, gap: 1.6 }] },
    { break: 22, groups: [{ t: 'runner', n: 14, gap: 0.32 }, { t: 'grunt', n: 8, gap: 0.5, overlap: 2 }] },
    { break: 22, groups: [{ t: 'flyer', n: 8, gap: 0.8 }] },
    { break: 20, groups: [{ t: 'shielded', n: 8, gap: 0.8 }, { t: 'tank', n: 4, gap: 1.5, overlap: 2 }] },
    { break: 20, groups: [{ t: 'splitter', n: 7, gap: 1.2 }] },
    { break: 20, groups: [{ t: 'phaser', n: 8, gap: 0.7 }] },
    { break: 18, groups: [{ t: 'swarm', n: 34, gap: 0.1 }, { t: 'runner', n: 12, gap: 0.3, overlap: 2 }] },
    { break: 18, groups: [{ t: 'tank', n: 8, gap: 1.1 }, { t: 'flyer', n: 8, gap: 0.7, overlap: 2 }] },
    { break: 16, groups: [{ t: 'phaser', n: 10, gap: 0.55 }, { t: 'shielded', n: 8, gap: 0.7, overlap: 2 }] },
    { break: 16, groups: [{ t: 'splitter', n: 9, gap: 0.9 }, { t: 'flyer', n: 10, gap: 0.6, overlap: 2 }] },
    { break: 16, groups: [{ t: 'tank', n: 10, gap: 0.9 }, { t: 'phaser', n: 10, gap: 0.5, overlap: 2 }, { t: 'swarm', n: 34, gap: 0.09, overlap: 2 }] },
  ],
};
