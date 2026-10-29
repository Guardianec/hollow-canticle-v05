import { ENEMIES, type EnemyDef, type Strike } from './data';
const cut = (
  kind: Strike['kind'],
  windup: number,
  damage: number,
  reach: number,
  recovery = 0.75,
  step = 18,
): Strike => ({ kind, windup, damage, reach, recovery, step });
const area = (windup = 1.15): Strike => ({ ...cut('smash', windup, 0, 520, 1.25), area: true });
export const GUARDIANS = [
  {
    key: 'ashen_marshal',
    name: 'The Ashen Marshal',
    title: 'Keeper of the First Descent',
    color: '#edb46d',
    hp: 330,
    posture: 112,
    speed: 98,
    scale: 1.6,
    reaction: 'counter',
    patterns: [
      [cut('slash', 0.85, 19, 135, 0.3), cut('thrust', 1.12, 23, 160, 1.15)],
      [area(), cut('slash', 0.72, 19, 140, 1.2)],
      [cut('feint', 0.6, 0, 140, 0.2), cut('thrust', 0.9, 22, 165, 1, 45)],
    ],
    phaseTwo: [
      [
        cut('slash', 0.7, 20, 140, 0.25),
        cut('slash', 0.58, 19, 145, 0.3),
        cut('sweep', 1.12, 24, 165, 1.25),
      ],
      [area(0.95), cut('thrust', 0.85, 24, 175, 1.25, 48)],
    ],
  },
  {
    key: 'drowned_prelate',
    name: 'The Drowned Prelate',
    title: 'Voice Beneath the Water',
    color: '#99e2e5',
    hp: 350,
    posture: 118,
    speed: 86,
    scale: 1.85,
    reaction: 'block',
    patterns: [
      [cut('thrust', 1.1, 20, 190, 0.5), cut('sweep', 1.3, 22, 175, 1.3)],
      [area(1.35)],
      [{ ...cut('thrust', 1.4, 18, 600, 1.3), projectile: 'orb' }],
    ],
    phaseTwo: [
      [area(1.05), cut('thrust', 0.95, 22, 200, 1.15, 38)],
      [
        { ...cut('thrust', 1.1, 19, 600, 0.4), projectile: 'orb' },
        cut('sweep', 1.15, 24, 185, 1.4),
      ],
    ],
  },
  {
    key: 'spore_crown',
    name: 'The Spore Crown',
    title: 'The Architecture Still Lives',
    color: '#b2d684',
    hp: 390,
    posture: 104,
    speed: 112,
    scale: 1.9,
    reaction: 'armor',
    patterns: [
      [cut('grab', 1.05, 25, 120, 1.25, 50)],
      [cut('slash', 0.85, 18, 140, 0.35), cut('slash', 1.25, 22, 155, 1.2)],
      [area(1.3)],
    ],
    phaseTwo: [
      [cut('thrust', 0.85, 23, 190, 0.35, 70), cut('sweep', 1.1, 24, 165, 1.35)],
      [area(1.05), cut('grab', 1, 26, 130, 1.35, 55)],
    ],
  },
  {
    key: 'pale_sentinel',
    name: 'The Pale Sentinel',
    title: 'Last Watch of the White Cloister',
    color: '#ceeaff',
    hp: 365,
    posture: 116,
    speed: 93,
    scale: 1.75,
    reaction: 'retreat',
    patterns: [
      [cut('thrust', 1.25, 23, 215, 0.45, -20), cut('sweep', 1.05, 21, 195, 1.35)],
      [area(1.25)],
      [cut('feint', 0.6, 0, 180, 0.2), cut('thrust', 1.05, 24, 210, 1.25, 48)],
    ],
    phaseTwo: [
      [cut('thrust', 0.9, 23, 220, 0.3, 55), cut('slash', 0.7, 20, 180, 1.2)],
      [area(0.95), cut('sweep', 1.1, 25, 210, 1.4)],
    ],
  },
  {
    key: 'forge_tyrant',
    name: 'The Forge Tyrant',
    title: 'Heart of the Unquenched Furnace',
    color: '#ff8951',
    hp: 440,
    posture: 132,
    speed: 70,
    scale: 2.15,
    reaction: 'armor',
    patterns: [
      [cut('smash', 1.6, 31, 170, 1.5)],
      [cut('sweep', 1.4, 25, 205, 0.4), cut('smash', 1.25, 29, 180, 1.5)],
      [area(1.5)],
    ],
    phaseTwo: [
      [area(1.15), cut('sweep', 1.2, 26, 215, 1.5)],
      [cut('smash', 1.3, 30, 185, 0.35, 40), cut('smash', 1.15, 28, 190, 1.65)],
    ],
  },
] satisfies (Pick<
  EnemyDef,
  'name' | 'color' | 'hp' | 'posture' | 'speed' | 'scale' | 'reaction' | 'patterns' | 'phaseTwo'
> & { key: string; title: string })[];
export function guardianFor(biome: number, depth = 1): EnemyDef {
  const base = ENEMIES.find((e) => e.id === 'boss')!;
  const guardian = GUARDIANS[biome];
  const cycle = Math.min(3, Math.floor((depth - 1) / 5));
  const phaseTwo = cycle
    ? [
        ...guardian.phaseTwo,
        [area(1.15), cut(biome === 2 ? 'grab' : 'thrust', 0.88, 24, 190, 1.25, 45 + cycle * 8)],
      ]
    : guardian.phaseTwo;
  return { ...base, ...guardian, id: 'boss', phaseTwo };
}
export function depthScaling(depth: number): number {
  return 1 + 0.32 * (1 - Math.exp(-Math.max(0, depth - 1) / 12));
}
