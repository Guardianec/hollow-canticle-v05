import type { Floor } from './dungeon';
export const TRAINING_STAGES = [
  ['move', 'Find your footing', 'WASD moves. Movement responds immediately.'],
  ['camera', 'Read the encounter', 'Move the mouse to aim or change focus. Tab cycles opponents.'],
  ['attack', 'Press the advantage', 'J / left mouse strikes.'],
  ['parry', 'Meet the blade', 'K / right mouse as the training slash lands.'],
  ['perfect', 'Find the silver instant', 'Deflect at the last instant for a perfect parry.'],
  ['dodge', 'Leave only a shadow', 'Space evades. You can dodge during attack recovery.'],
  ['guard', 'Fracture the guard', 'Deflect and counter until the gold guard bar breaks.'],
  ['finisher', 'Keep your oath', 'Approach a broken guard and press E.'],
  ['ranged', 'Offer silver', 'R / middle mouse spends a rechargeable ranged charge.'],
  ['projectile', 'Deflect the arrow', 'K as the arrow reaches you.'],
  ['reflection', 'Return their oath', 'Perfectly deflect an arrow to return it.'],
  ['switch', 'Choose an offering', '1 / 2 changes the selected satchel item.'],
  ['item', 'Use an opening', 'Q uses the selected offering. Bell Oil works at full vitality.'],
] as const;
export function trainingStages(shinobi: boolean): readonly (readonly [string, string, string])[] {
  return shinobi
    ? [
        ...TRAINING_STAGES,
        [
          'riposte',
          'Cinder return',
          'After deflecting, or a close springlock hit, press J to dash, cut and return. Riposte cannot kill.',
        ],
      ]
    : TRAINING_STAGES;
}
export function trainingFloor(seed: string): Floor {
  return {
    seed,
    depth: 1,
    biome: 0,
    hybrid: null,
    rooms: [
      {
        id: 0,
        x: 0,
        y: 0,
        kind: 'combat',
        name: 'The Practice of Steel',
        template: 'duel-arena',
        variant: 0,
        links: [],
        enemies: ['warden'],
        budget: 2,
        modifier: 'Quiet',
        elite: 'Patient',
        visited: true,
        cleared: false,
        claimed: true,
        artSeed: 'PRACTICE-COURTYARD',
        landmark: 'courtyard',
        transition: false,
      },
    ],
  };
}
