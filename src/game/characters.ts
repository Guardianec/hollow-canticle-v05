import type { AttackKind } from './data';

export interface MeleeMove {
  name: string;
  kind: AttackKind;
  startup: number;
  recovery: number;
  damage: number;
  pressure: number;
  reach: number;
  step: number;
}
export interface CharacterDef {
  id: string;
  name: string;
  role: string;
  description: string;
  color: string;
  speed: number;
  difficulty: string;
  ratings: [string, string, string, string];
  passive: string;
  chain: MeleeMove[];
  ranged: {
    name: string;
    kind: 'needle' | 'knife' | 'javelin' | 'wave';
    charges: number;
    recharge: number;
    startup: number;
    recovery: number;
    damage: number;
    pressure: number;
    speed: number;
    radius: number;
    lifetime: number;
    pierce: number;
    description: string;
  };
}
const move = (
  name: string,
  kind: AttackKind,
  startup = 1,
  recovery = 1,
  damage = 1,
  pressure = 1,
  reach = 1,
  step = 10,
): MeleeMove => ({ name, kind, startup, recovery, damage, pressure, reach, step });

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'sword',
    name: 'The Oathkeeper',
    role: 'Balanced duelist',
    description: 'A patient keeper of broken vows. Meet the blade, then answer with silver.',
    color: '#d7e8e4',
    speed: 1,
    difficulty: 'Steady',
    ratings: ['Measured', 'Balanced', 'Firm', 'Forgiving'],
    passive: 'Perfect parries advance the next ranged charge by 1 second.',
    chain: [
      move('Oath cut', 'slash'),
      move('Return cut', 'slash', 1.1, 0.95),
      move('Advancing oath', 'sweep', 1.25, 1.05, 1.1, 1.2, 1.08, 22),
      move('Silver point', 'thrust', 1.4, 1.2, 1.2, 1.3, 1.15, 18),
    ],
    ranged: {
      name: 'Silver Needle',
      kind: 'needle',
      charges: 3,
      recharge: 8,
      startup: 0.2,
      recovery: 0.2,
      damage: 10,
      pressure: 24,
      speed: 640,
      radius: 5,
      lifetime: 1.1,
      pierce: 0,
      description: 'A precise spectral blade. Interrupts exposed archers.',
    },
  },
  {
    id: 'twins',
    name: 'The Moth',
    role: 'Relentless skirmisher',
    description: 'Two blades, one restless shadow. Stay close enough to hear their breath.',
    color: '#d0b8df',
    speed: 1.08,
    difficulty: 'Nimble',
    ratings: ['Very fast', 'Close', 'Sustained', 'Exact'],
    passive: 'Completing a four-hit chain advances the next knife by 0.8 seconds.',
    chain: [
      move('Right wing', 'slash'),
      move('Left wing', 'slash', 1, 0.9),
      move('Cross cut', 'slash', 1.3, 1.1, 1.2, 1.2),
      move('Step-through spiral', 'sweep', 1.6, 1.3, 1.3, 1.35, 1.1, 24),
    ],
    ranged: {
      name: 'Moth Knives',
      kind: 'knife',
      charges: 5,
      recharge: 5,
      startup: 0.1,
      recovery: 0.12,
      damage: 5,
      pressure: 12,
      speed: 570,
      radius: 6,
      lifetime: 0.95,
      pierce: 0,
      description: 'A quick knife flick. Spend several to interrupt a moving foe.',
    },
  },
  {
    id: 'spear',
    name: 'The Pilgrim Lancer',
    role: 'Keeper of distance',
    description: 'A weathered pilgrim whose long reach holds the dark at the tip of a prayer.',
    color: '#c2d7e9',
    speed: 0.97,
    difficulty: 'Deliberate',
    ratings: ['Deliberate', 'Very long', 'Strong', 'Measured'],
    passive: 'Reflected projectiles inflict 20% more posture pressure.',
    chain: [
      move('Long prayer', 'thrust', 1, 1, 1, 1, 1.03, 16),
      move('Short prayer', 'thrust', 0.75, 0.85, 0.9, 1, 0.86, 8),
      move('Procession', 'thrust', 1.1, 1.1, 1.1, 1.2, 1.1, 26),
      move('Dragging crescent', 'sweep', 1.3, 1.25, 1.1, 1.35, 0.9, -12),
    ],
    ranged: {
      name: "Pilgrim's Javelin",
      kind: 'javelin',
      charges: 2,
      recharge: 11,
      startup: 0.5,
      recovery: 0.3,
      damage: 16,
      pressure: 40,
      speed: 490,
      radius: 8,
      lifetime: 1.7,
      pierce: 1,
      description: 'A committed throw that pierces one additional foe.',
    },
  },
  {
    id: 'great',
    name: 'The Bellbearer',
    role: 'Breaker of guards',
    description: 'The weight of a silent bell rests in every full-body stroke.',
    color: '#e5c48c',
    speed: 0.94,
    difficulty: 'Resolute',
    ratings: ['Heavy', 'Long', 'Crushing', 'Rewarding'],
    passive: 'Breaking a guard advances the next Last Toll by 2 seconds.',
    chain: [
      move('Heavy judgement', 'slash', 1, 1, 1, 1.1, 1, 14),
      move('Reverse toll', 'sweep', 1.1, 1.1, 1.05, 1.15),
      move('Execution stroke', 'smash', 1.3, 1.15, 1.2, 1.4, 1, 18),
      move('Shouldered point', 'thrust', 0.9, 1.1, 0.9, 1.3, 1.1, 24),
    ],
    ranged: {
      name: 'Last Toll',
      kind: 'wave',
      charges: 2,
      recharge: 12.5,
      startup: 0.48,
      recovery: 0.35,
      damage: 8,
      pressure: 48,
      speed: 300,
      radius: 16,
      lifetime: 1.8,
      pierce: 2,
      description: 'A narrow ground-travelling resonance. Modest wounds, crushing pressure.',
    },
  },
  {
    id: 'shinobi',
    name: 'The Ashen Shinobi',
    role: 'Deflection specialist',
    description:
      'A black-clad wanderer beneath a low travelling hat. Asymmetric lacquer plates, a precise katana and a springlock sidearm answer every opening.',
    color: '#dc9278',
    speed: 1.02,
    difficulty: 'Exacting',
    ratings: ['Precise', 'Moderate', 'Counter pressure', 'Exact'],
    passive:
      'Deflections build extra guard pressure. Strike after a deflection or a close springlock hit to dash in, cut, and retreat. Riposte leaves at least 1 HP.',
    chain: [
      move('Cinder draw', 'slash', 1, 1, 1, 1, 1, 8),
      move('Returning ember', 'slash', 1.1, 1, 0.95, 1.05, 1, 6),
      move('Quiet severance', 'thrust', 1.25, 1.15, 1.1, 1.2, 1.05, 12),
      move('Last cinder', 'slash', 1.4, 1.2, 1.15, 1.35, 1, 10),
    ],
    ranged: {
      name: 'Cinder Springlock',
      kind: 'needle',
      charges: 3,
      recharge: 9,
      startup: 0.18,
      recovery: 0.24,
      damage: 3,
      pressure: 10,
      speed: 670,
      radius: 5,
      lifetime: 0.95,
      pierce: 0,
      description:
        'A bronze spring-driven sidearm. Hits within 245 units open a katana riposte; distant hits do little damage.',
    },
  },
];
export const characterFor = (id: string): CharacterDef =>
  CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
export function meleeMove(character: CharacterDef, combo: number, type: string): MeleeMove {
  if (type === 'counter')
    return move(
      character.id === 'twins' ? 'Twin reprisal' : 'Oath answered',
      'thrust',
      0.8,
      0.9,
      1.15,
      1.15,
      1.08,
      20,
    );
  if (type === 'heavy')
    return move(
      'Burdened judgement',
      character.id === 'spear' ? 'thrust' : 'smash',
      2.2,
      1.5,
      1.35,
      1.9,
      1.06,
      12,
    );
  if (type === 'dodge')
    return move(
      'Returning shadow',
      character.id === 'spear' ? 'thrust' : 'sweep',
      0.9,
      1,
      1,
      1.1,
      1.05,
      character.id === 'spear' ? -14 : 20,
    );
  if (type === 'running') return move('Advancing prayer', 'thrust', 1.15, 1.1, 1.05, 1.1, 1.1, 28);
  return character.chain[combo % character.chain.length];
}
