export type AttackKind = 'slash' | 'thrust' | 'sweep' | 'smash' | 'grab' | 'feint';
export interface Strike {
  kind: AttackKind;
  area?: boolean;
  windup: number;
  recovery: number;
  damage: number;
  reach: number;
  step?: number;
  echo?: boolean;
  projectile?: 'arrow' | 'orb';
  projectileRadius?: number;
}
const strike = (
  kind: AttackKind,
  windup: number,
  recovery = 0.6,
  damage = 15,
  reach = 100,
): Strike => ({ kind, windup, recovery, damage, reach });
export interface EnemyDef {
  key?: string;
  title?: string;
  id: string;
  name: string;
  role: string;
  hp: number;
  posture: number;
  speed: number;
  cost: number;
  color: string;
  scale: number;
  affinity: number[];
  patterns: Strike[][];
  phaseTwo?: Strike[][];
  reaction: 'block' | 'retreat' | 'armor' | 'counter';
}
export const ENEMIES: EnemyDef[] = [
  {
    id: 'warden',
    name: 'Cinder Warden',
    role: 'Soldier',
    hp: 105,
    posture: 70,
    speed: 92,
    cost: 2,
    color: '#b58e72',
    scale: 1.05,
    affinity: [0, 4],
    reaction: 'block',
    patterns: [
      [strike('slash', 0.7), strike('slash', 0.48), strike('thrust', 1.05)],
      [strike('thrust', 0.85), strike('slash', 0.63, 0.85)],
      [strike('slash', 1.1, 0.2), strike('slash', 0.44, 0.25), strike('thrust', 0.8, 0.9)],
    ],
  },
  {
    id: 'shield',
    name: 'Grave Aegis',
    role: 'Shieldbearer',
    hp: 148,
    posture: 100,
    speed: 70,
    cost: 4,
    color: '#7e939b',
    scale: 1.18,
    affinity: [0, 3],
    reaction: 'block',
    patterns: [
      [strike('slash', 0.9), strike('smash', 1.15, 0.9, 22)],
      [strike('grab', 1.1, 1, 18, 85)],
    ],
  },
  {
    id: 'duelist',
    name: 'Veilblade',
    role: 'Duelist',
    hp: 102,
    posture: 68,
    speed: 117,
    cost: 4,
    color: '#af7d86',
    scale: 1,
    affinity: [0, 3],
    reaction: 'counter',
    patterns: [
      [strike('slash', 0.5, 0.25), strike('slash', 0.42, 0.3), strike('thrust', 1.2, 0.8)],
      [strike('feint', 0.45, 0.15), strike('slash', 0.8)],
      [strike('slash', 1.45, 0.22), strike('slash', 0.42, 0.24), strike('thrust', 0.85, 0.85)],
      [{ ...strike('thrust', 0.7, 0.9, 16, 125), step: 30 }],
    ],
  },
  {
    id: 'spear',
    name: 'Hollow Lancer',
    role: 'Spearman',
    hp: 108,
    posture: 74,
    speed: 82,
    cost: 3,
    color: '#b7aaa0',
    scale: 1.08,
    affinity: [0, 3],
    reaction: 'retreat',
    patterns: [
      [strike('thrust', 0.95, 0.35, 16, 155), strike('sweep', 0.85, 0.8, 15, 145)],
      [
        { ...strike('thrust', 0.7, 0.25, 13, 155), step: 28 },
        strike('thrust', 0.52, 0.85, 13, 155),
      ],
      [strike('feint', 0.6, 0.15), strike('sweep', 0.8, 0.8, 15, 145)],
      [{ ...strike('thrust', 1.1, 0.85, 16, 170), step: -24 }],
    ],
  },
  {
    id: 'assassin',
    name: 'Moth Reaver',
    role: 'Assassin',
    hp: 80,
    posture: 54,
    speed: 145,
    cost: 4,
    color: '#9b849c',
    scale: 0.94,
    affinity: [2, 4],
    reaction: 'retreat',
    patterns: [
      [strike('feint', 0.45, 0.2), strike('thrust', 0.6, 0.6, 14)],
      [strike('slash', 0.55, 0.25), strike('grab', 0.85, 0.9, 21)],
      [
        strike('slash', 0.5, 0.2),
        strike('slash', 1.12, 0.2),
        { ...strike('thrust', 0.55, 0.9), step: 30 },
      ],
    ],
  },
  {
    id: 'monk',
    name: 'Drowned Cantor',
    role: 'Monk',
    hp: 120,
    posture: 82,
    speed: 98,
    cost: 4,
    color: '#87b3af',
    scale: 1.05,
    affinity: [1, 3],
    reaction: 'counter',
    patterns: [
      [
        strike('slash', 0.75, 0.25),
        strike('slash', 0.6, 0.25),
        strike('slash', 1.12, 0.2),
        strike('slash', 0.45, 0.2),
        strike('sweep', 0.95, 1),
      ],
      [strike('thrust', 1, 0.8, 18, 125)],
    ],
  },
  {
    id: 'brute',
    name: 'Bellbreaker',
    role: 'Brute',
    hp: 188,
    posture: 105,
    speed: 64,
    cost: 5,
    color: '#b19a76',
    scale: 1.45,
    affinity: [2, 4],
    reaction: 'armor',
    patterns: [
      [strike('smash', 1.4, 0.25, 26, 115), strike('slash', 0.55, 1.15, 17, 110)],
      [strike('grab', 1.1, 1.2, 25, 95)],
      [strike('sweep', 1.35, 0.25, 22, 130), { ...strike('grab', 0.65, 1.3, 18, 100), step: 26 }],
    ],
  },
  {
    id: 'beast',
    name: 'Sporebound',
    role: 'Beast',
    hp: 98,
    posture: 62,
    speed: 132,
    cost: 3,
    color: '#a8b789',
    scale: 1.12,
    affinity: [1, 2],
    reaction: 'armor',
    patterns: [
      [strike('grab', 0.9, 0.65, 18, 100), strike('slash', 0.6, 0.75)],
      [strike('sweep', 0.85, 0.7, 15, 110)],
    ],
  },
  {
    id: 'boss',
    name: 'The Unrung Saint',
    role: 'Guardian',
    hp: 330,
    posture: 112,
    speed: 90,
    cost: 10,
    color: '#ddbc7d',
    scale: 1.7,
    affinity: [0, 1, 2, 3, 4],
    reaction: 'armor',
    patterns: [
      [
        strike('slash', 0.9, 0.3, 18, 125),
        strike('slash', 0.65, 0.3, 18, 125),
        strike('smash', 1.35, 1.1, 28, 145),
      ],
      [
        strike('feint', 0.55, 0.2),
        strike('thrust', 0.85, 0.3, 20, 155),
        strike('sweep', 1.05, 0.9, 18, 145),
      ],
    ],
    phaseTwo: [
      [
        { ...strike('smash', 1.2, 0.85, 24, 145), echo: true },
        strike('thrust', 0.72, 0.35, 18, 165),
      ],
      [
        strike('feint', 0.58, 0.15),
        { ...strike('thrust', 0.7, 0.25, 18, 175), step: 38 },
        strike('slash', 0.5, 0.3, 16, 135),
        strike('sweep', 1.1, 1.15, 19, 150),
      ],
      [
        strike('slash', 1.35, 0.2, 18, 130),
        strike('slash', 0.48, 0.25, 16, 130),
        { ...strike('smash', 0.95, 1.1, 24, 145), echo: true },
      ],
    ],
  },
  {
    id: 'archer',
    name: 'Ashen Archer',
    role: 'Ranged support',
    hp: 72,
    posture: 46,
    speed: 94,
    cost: 2,
    color: '#bfa486',
    scale: 1,
    affinity: [0, 3, 4],
    reaction: 'retreat',
    patterns: [
      [{ ...strike('thrust', 1.05, 1.3, 12, 650), projectile: 'arrow' }],
      [{ ...strike('thrust', 1.5, 1.2, 15, 650), projectile: 'arrow' }],
      [{ ...strike('thrust', 0.75, 1.6, 10, 580), projectile: 'arrow' }],
    ],
  },
  {
    id: 'hexer',
    name: 'Bell Acolyte',
    role: 'Resonant caster',
    hp: 86,
    posture: 55,
    speed: 75,
    cost: 3,
    color: '#a9c9be',
    scale: 1.04,
    affinity: [1, 2],
    reaction: 'counter',
    patterns: [
      [{ ...strike('thrust', 1.25, 1.5, 15, 590), projectile: 'orb' }],
      [{ ...strike('thrust', 1.9, 1.7, 21, 620), projectile: 'orb', projectileRadius: 19 }],
      [{ ...strike('thrust', 1.6, 1.3, 12, 560), projectile: 'orb' }],
    ],
  },
];

// Additional tools reuse the accepted articulated attack vocabulary.
const extraPatterns: Record<string, Strike[][]> = {
  warden: [
    [{ ...strike('thrust', 0.6, 0.85, 9, 75), step: 15 }],
    [strike('smash', 1.5, 1, 21, 115)],
  ],
  shield: [
    [{ ...strike('thrust', 0.8, 0.9, 16, 85), step: 32 }],
    [strike('slash', 0.65, 0.3), strike('smash', 1.45, 1.2, 24)],
  ],
  duelist: [
    [{ ...strike('thrust', 1.55, 0.8, 17, 145), step: -18 }],
    [strike('feint', 0.4, 0.2), strike('feint', 0.55, 0.2), strike('slash', 0.9)],
  ],
  spear: [[{ ...strike('sweep', 1.3, 0.9, 17, 175), step: -12 }]],
  assassin: [
    [strike('slash', 0.55, 0.2), { ...strike('slash', 0.5, 0.8), step: 36 }],
    [strike('sweep', 1.3, 1, 17, 115)],
  ],
  monk: [
    [
      strike('thrust', 0.65, 0.25, 12, 120),
      strike('slash', 0.7, 0.25),
      strike('sweep', 1.5, 1, 19, 140),
    ],
  ],
  brute: [
    [{ ...strike('thrust', 1.05, 0.25, 20, 125), step: 42 }, strike('smash', 0.75, 1.4, 24, 120)],
  ],
  beast: [
    [
      { ...strike('grab', 1.05, 0.3, 19, 145), step: 48 },
      strike('slash', 0.5, 0.3),
      strike('slash', 0.55, 0.9),
    ],
    [{ ...strike('sweep', 1.1, 0.9, 16, 125), step: -28 }],
  ],
  boss: [[{ ...strike('thrust', 1.5, 1.3, 18, 650), projectile: 'orb' }]],
};
for (const enemy of ENEMIES) enemy.patterns.push(...(extraPatterns[enemy.id] ?? []));
ENEMIES.find((e) => e.id === 'boss')!.phaseTwo!.push([
  { ...strike('thrust', 1.4, 0.6, 22, 650), projectile: 'orb' },
  strike('sweep', 1.15, 1.2, 21, 160),
]);

export interface Weapon {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  startup: number;
  recovery: number;
  reach: number;
  damage: number;
  pressure: number;
  parry: number;
}
export const WEAPONS: Weapon[] = [
  {
    id: 'sword',
    name: 'Oathkeeper',
    subtitle: 'BALANCED BLADE',
    description: 'Generous deflection. A counter after a parry breaks through guards.',
    startup: 0.13,
    recovery: 0.3,
    reach: 112,
    damage: 13,
    pressure: 13,
    parry: 0.22,
  },
  {
    id: 'twins',
    name: 'Moth & Thorn',
    subtitle: 'TWIN BLADES',
    description: 'Fast chains, tight parries. Consecutive strikes build extra Focus.',
    startup: 0.08,
    recovery: 0.19,
    reach: 88,
    damage: 8,
    pressure: 10,
    parry: 0.19,
  },
  {
    id: 'spear',
    name: 'Pilgrim’s Reach',
    subtitle: 'LONG SPEAR',
    description: 'Keep your distance. Thrust counters deal double posture damage.',
    startup: 0.22,
    recovery: 0.34,
    reach: 174,
    damage: 12,
    pressure: 15,
    parry: 0.22,
  },
  {
    id: 'great',
    name: 'Last Toll',
    subtitle: 'GREATBLADE',
    description: 'Slow, crushing pressure. Perfect deflections can turn heavy smashes.',
    startup: 0.32,
    recovery: 0.48,
    reach: 138,
    damage: 22,
    pressure: 25,
    parry: 0.2,
  },
  {
    id: 'shinobi',
    name: 'Cinder Edge',
    subtitle: 'KATANA & SPRINGLOCK',
    description: 'Deflect, riposte, break guard. A riposte cannot kill; finish the opening.',
    startup: 0.12,
    recovery: 0.24,
    reach: 118,
    damage: 9,
    pressure: 11,
    parry: 0.2,
  },
];

export const BIOMES = [
  {
    name: 'The Forgotten Ruins',
    short: 'Ruins',
    label: 'WHERE THE BELLS FELL SILENT',
    floor: '#303a3b',
    tile: '#374244',
    light: '#f8b15d',
    accent: '#bbac8c',
    hazard: 'Falling embers',
    decoration: 'ruin',
  },
  {
    name: 'The Drowned Shrine',
    short: 'Shrine',
    label: 'THE WATER REMEMBERS',
    floor: '#203b42',
    tile: '#2a4850',
    light: '#84d5cf',
    accent: '#82c4c5',
    hazard: 'Deep water',
    decoration: 'water',
  },
  {
    name: 'The Fungal Choir',
    short: 'Depths',
    label: 'SOMETHING SINGS BELOW',
    floor: '#30343e',
    tile: '#3b3f4b',
    light: '#c19bff',
    accent: '#b7a0d7',
    hazard: 'Spore bloom',
    decoration: 'fungal',
  },
  {
    name: 'The Winter Cloister',
    short: 'Cloister',
    label: 'A PRAYER HELD IN ICE',
    floor: '#35434c',
    tile: '#414f58',
    light: '#afd6ef',
    accent: '#b8d8e4',
    hazard: 'Brittle ice',
    decoration: 'ice',
  },
  {
    name: 'The Ember Foundry',
    short: 'Foundry',
    label: 'EVERY FLAME OWES A DEBT',
    floor: '#41342f',
    tile: '#4b3d35',
    light: '#ff9650',
    accent: '#e4a579',
    hazard: 'Furnace vents',
    decoration: 'lava',
  },
] as const;
export type RelicEvent =
  | 'parry'
  | 'perfect'
  | 'dodge'
  | 'attack'
  | 'counter'
  | 'hurt'
  | 'break'
  | 'finisher'
  | 'enter'
  | 'clear';
export type RelicEffect =
  | 'ranged'
  | 'heal'
  | 'focus'
  | 'pressure'
  | 'echo'
  | 'window'
  | 'burn'
  | 'ward'
  | 'hunger'
  | 'mirror'
  | 'chain';
export interface Relic {
  id: string;
  name: string;
  glyph: string;
  rarity: 'Faded' | 'Rare' | 'Sacred';
  description: string;
  event: RelicEvent;
  effect: RelicEffect;
  amount: number;
}
export const RELICS: Relic[] = [
  {
    id: 'returning',
    name: 'Returning Hymn',
    glyph: '↶',
    rarity: 'Rare',
    description: 'Every third perfect projectile reflection restores one ranged charge.',
    event: 'perfect',
    effect: 'ranged',
    amount: 1,
  },
  {
    id: 'hunter',
    name: "Hunter's Prayer",
    glyph: '↟',
    rarity: 'Rare',
    description: 'Ranged projectiles deal 30% more posture pressure to a foe preparing an attack.',
    event: 'attack',
    effect: 'ranged',
    amount: 1.3,
  },
  {
    id: 'quiver',
    name: 'Still Quiver',
    glyph: '⋮',
    rarity: 'Faded',
    description: 'Stand still for one second to recharge ranged offerings 25% faster.',
    event: 'enter',
    effect: 'ranged',
    amount: 1.25,
  },
  {
    id: 'glass-arrow',
    name: 'Glass Arrow',
    glyph: '◇',
    rarity: 'Sacred',
    description: 'Ranged abilities deal 40% more vitality damage, but recharge 35% more slowly.',
    event: 'attack',
    effect: 'ranged',
    amount: 1.4,
  },
  {
    id: 'echo',
    name: 'Echoing Steel',
    glyph: '⌁',
    rarity: 'Rare',
    description: 'Every third perfect parry sends a posture shockwave through nearby foes.',
    event: 'perfect',
    effect: 'echo',
    amount: 25,
  },
  {
    id: 'ghost',
    name: 'Ghost Step',
    glyph: '◇',
    rarity: 'Rare',
    description: 'Dodging an incoming strike widens your next parry window.',
    event: 'dodge',
    effect: 'window',
    amount: 0.12,
  },
  {
    id: 'blood',
    name: 'Red Benediction',
    glyph: '†',
    rarity: 'Sacred',
    description: 'Perfect parries restore 5 vitality while below half health.',
    event: 'perfect',
    effect: 'heal',
    amount: 5,
  },
  {
    id: 'bell',
    name: 'Fracture Bell',
    glyph: '♧',
    rarity: 'Rare',
    description: 'Breaking a guard sends 20 posture damage through nearby foes.',
    event: 'break',
    effect: 'pressure',
    amount: 20,
  },
  {
    id: 'mirror',
    name: 'Mirror Fang',
    glyph: '⋈',
    rarity: 'Sacred',
    description: 'Every third parry moves you behind your opponent, ready to counter.',
    event: 'parry',
    effect: 'mirror',
    amount: 3,
  },
  {
    id: 'ember',
    name: 'Ember Edge',
    glyph: '⌇',
    rarity: 'Rare',
    description: 'Counters scorch an enemy’s posture for three seconds.',
    event: 'counter',
    effect: 'burn',
    amount: 5,
  },
  {
    id: 'still',
    name: 'Still Water',
    glyph: '≈',
    rarity: 'Faded',
    description: 'Perfect parries grant extra Focus when you hold your ground.',
    event: 'perfect',
    effect: 'focus',
    amount: 12,
  },
  {
    id: 'hunger',
    name: 'Hungry Blade',
    glyph: '⟐',
    rarity: 'Sacred',
    description: 'Finishers feed your blade: +3 attack damage until you are hit.',
    event: 'finisher',
    effect: 'hunger',
    amount: 3,
  },
  {
    id: 'thread',
    name: 'Lightning Thread',
    glyph: 'ϟ',
    rarity: 'Sacred',
    description: 'A finisher strikes every other living enemy for 22 vitality.',
    event: 'finisher',
    effect: 'chain',
    amount: 22,
  },
  {
    id: 'glass',
    name: 'Glass Canticle',
    glyph: '♢',
    rarity: 'Rare',
    description: 'Parries grant 10 extra Focus, but a hit drains all Focus.',
    event: 'parry',
    effect: 'focus',
    amount: 10,
  },
  {
    id: 'moss',
    name: 'Mossheart',
    glyph: '♧',
    rarity: 'Faded',
    description: 'Clearing a room restores 8 vitality.',
    event: 'clear',
    effect: 'heal',
    amount: 8,
  },
  {
    id: 'candle',
    name: 'Last Candle',
    glyph: '♙',
    rarity: 'Faded',
    description: 'Entering a room grants a ward that absorbs the next 6 damage.',
    event: 'enter',
    effect: 'ward',
    amount: 6,
  },
  {
    id: 'pulse',
    name: 'Pilgrim’s Pulse',
    glyph: '◉',
    rarity: 'Faded',
    description: 'An attack after a parry restores 3 vitality.',
    event: 'counter',
    effect: 'heal',
    amount: 3,
  },
  {
    id: 'thorn',
    name: 'Thorn Covenant',
    glyph: '×',
    rarity: 'Rare',
    description: 'Taking damage releases a 16-posture shockwave.',
    event: 'hurt',
    effect: 'pressure',
    amount: 16,
  },
  {
    id: 'vessel',
    name: 'Empty Vessel',
    glyph: '∪',
    rarity: 'Faded',
    description: 'Finishers fill 25 Focus, bringing your next technique closer.',
    event: 'finisher',
    effect: 'focus',
    amount: 25,
  },
  {
    id: 'ash',
    name: 'Ashen Promise',
    glyph: '✧',
    rarity: 'Faded',
    description: 'Perfect parries grant a ward that absorbs 4 damage.',
    event: 'perfect',
    effect: 'ward',
    amount: 4,
  },
  {
    id: 'suture',
    name: 'Silver Suture',
    glyph: '⌘',
    rarity: 'Rare',
    description: 'Finishers restore 12 vitality.',
    event: 'finisher',
    effect: 'heal',
    amount: 12,
  },
  {
    id: 'cadence',
    name: 'Lost Cadence',
    glyph: '∴',
    rarity: 'Faded',
    description: 'Each successful counter adds 9 Focus.',
    event: 'counter',
    effect: 'focus',
    amount: 9,
  },
];

export const BALANCE = {
  playerHp: 100,
  speed: 220,
  buffer: 0.13,
  perfect: 0.085,
  dodgeTime: 0.34,
  dodgeInvulnerable: 0.23,
  dodgeCooldown: 0.62,
  postureRecovery: 12,
  parryPressure: 19,
  perfectPressure: 31,
  finisherRange: 168,
  worldWidth: 1120,
  worldHeight: 760,
};
