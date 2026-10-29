import { ENEMIES } from '../src/game/data';
import { Random } from '../src/game/random';
import type { Room } from '../src/game/dungeon';

export const SCALING = [
  { budget: 1, hp: 1, posture: 1, cap: 4, bossHp: 1, bossPosture: 1 },
  { budget: 1.55, hp: 1.08, posture: 1.05, cap: 6, bossHp: 1.45, bossPosture: 1.12 },
  { budget: 2.05, hp: 1.14, posture: 1.1, cap: 7, bossHp: 1.8, bossPosture: 1.22 },
  { budget: 2.55, hp: 1.2, posture: 1.15, cap: 8, bossHp: 2.1, bossPosture: 1.3 },
] as const;
export function scaling(count: number) {
  return SCALING[Math.max(0, Math.min(3, count - 1))];
}
export function encounter(room: Room, count: number, seed: string, biome = 0): string[] {
  if (count <= 1 || !room.enemies.length || room.cleared) return [...room.enemies];
  const scale = scaling(count),
    rng = new Random(`${seed}:${room.artSeed}:party:${count}`);
  if (room.kind === 'boss')
    return [
      'boss',
      ...(count >= 3 ? [['archer', 'hexer', 'beast', 'archer', 'warden'][biome]] : []),
    ];
  const cost = (id: string) => ENEMIES.find((e) => e.id === id)?.cost ?? 1;
  const budget =
    Math.max(
      room.budget,
      room.enemies.reduce((sum, id) => sum + cost(id), 0),
    ) * scale.budget;
  const result = [...room.enemies].slice(0, scale.cap);
  const choices = [
    'warden',
    'duelist',
    'spear',
    'archer',
    'hexer',
    'shield',
    'assassin',
    'monk',
  ].filter((id) => ENEMIES.some((e) => e.id === id && e.affinity.includes(biome)));
  if (!result.some((id) => ['archer', 'hexer'].includes(id)))
    result.push(rng.pick(choices.filter((id) => ['archer', 'hexer'].includes(id))));
  let spent = result.reduce((sum, id) => sum + cost(id), 0);
  while (result.length < scale.cap) {
    const eligible = choices.filter((id) => spent + cost(id) <= budget);
    if (!eligible.length) break;
    const id = rng.pick(eligible);
    result.push(id);
    spent += cost(id);
  }
  return result.slice(0, scale.cap);
}
export const ELITE_CHANCE = [0, 0.06, 0.12, 0.18] as const;
export function eliteFor(
  room: Room,
  count: number,
  seed: string,
  ids: string[],
): number | undefined {
  if (room.kind !== 'combat' || count < 2) return;
  const rng = new Random(`${seed}:${room.artSeed}:elite:${count}`);
  if (rng.next() >= ELITE_CHANCE[Math.min(3, count - 1)]) return;
  const candidates = ids
    .map((id, i) => ({ id, i }))
    .filter(({ id }) => !['boss', 'archer', 'hexer'].includes(id));
  return candidates.length ? rng.pick(candidates).i : undefined;
}
