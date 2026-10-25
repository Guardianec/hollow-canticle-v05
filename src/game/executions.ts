import type { AttackKind } from './data';
import { Random } from './random';

export const EXECUTION_DURATION = 0.7;
export const EXECUTION_CONTACT = 0.58;
export const EXECUTIONS: Record<string, readonly { name: string; kind: AttackKind }[]> = {
  shinobi: [
    { name: 'The silent ember', kind: 'slash' },
    { name: 'Cinder severance', kind: 'thrust' },
    { name: 'An oath unbound', kind: 'slash' },
  ],
  sword: [
    { name: 'The quiet point', kind: 'thrust' },
    { name: 'Rising absolution', kind: 'slash' },
    { name: 'The reverse oath', kind: 'slash' },
  ],
  twins: [
    { name: 'Crossed prayers', kind: 'slash' },
    { name: 'Moth ascending', kind: 'slash' },
    { name: 'The turning veil', kind: 'sweep' },
  ],
  spear: [
    { name: 'The last measure', kind: 'thrust' },
    { name: 'Haft and point', kind: 'thrust' },
    { name: 'The grounded vow', kind: 'thrust' },
  ],
  great: [
    { name: 'The falling bell', kind: 'smash' },
    { name: 'Shoulder of judgement', kind: 'slash' },
    { name: 'Ashen reckoning', kind: 'sweep' },
  ],
};

/** Cosmetic rotation never consumes the dungeon, combat, or loot random streams. */
export function executionVariant(seed: string, weapon: string, count: number): number {
  return (new Random(seed + ':execution:' + weapon).int(0, 2) + count) % 3;
}
