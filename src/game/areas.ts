export const AREA_KINDS = ['ember', 'resonance', 'spores', 'frost', 'molten'] as const;
export type AreaKind = (typeof AREA_KINDS)[number];
export type AreaPhase = 'telegraph' | 'active' | 'fading';
export const AREA_RULES = {
  ember: {
    radius: 76,
    warning: 1.25,
    duration: 4.8,
    damage: 6,
    posture: 5,
    tick: 0.8,
    color: '#f49542',
    status: '',
  },
  resonance: {
    radius: 145,
    warning: 1.5,
    duration: 1.8,
    damage: 9,
    posture: 24,
    tick: 0.6,
    color: '#83e2ed',
    status: '',
  },
  spores: {
    radius: 102,
    warning: 1.5,
    duration: 5.2,
    damage: 4,
    posture: 3,
    tick: 0.9,
    color: '#b6de73',
    status: 'poison',
  },
  frost: {
    radius: 94,
    warning: 1.4,
    duration: 3.8,
    damage: 5,
    posture: 8,
    tick: 0.85,
    color: '#b8e8ff',
    status: 'frost',
  },
  molten: {
    radius: 83,
    warning: 1.3,
    duration: 3.1,
    damage: 11,
    posture: 8,
    tick: 0.7,
    color: '#ff6034',
    status: '',
  },
} as const;
export interface AreaEffect {
  id: number;
  source: number;
  biome: number;
  kind: AreaKind;
  team: string;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  radius: number;
  warningRadius: number;
  createdAt: number;
  armAt: number;
  expireAt: number;
  damage: number;
  postureDamage: number;
  tickRate: number;
  status: string;
}
export function areaPhase(a: AreaEffect, time: number): AreaPhase {
  return time < a.armAt ? 'telegraph' : time < a.expireAt ? 'active' : 'fading';
}
export function areaContains(a: AreaEffect, x: number, y: number, time: number): boolean {
  if (time < a.armAt || time >= a.expireAt) return false;
  const distance = Math.hypot(x - a.x, y - a.y);
  if (a.kind === 'resonance') {
    const wave = a.radius * Math.min(1, (time - a.armAt) / (a.expireAt - a.armAt));
    return Math.abs(distance - wave) <= 24;
  }
  return distance < a.radius;
}
export const areaCap = (players: number): number =>
  [2, 3, 4, 5][Math.max(0, Math.min(3, players - 1))];
export interface AreaTarget {
  id: number;
  x: number;
  y: number;
  team: string;
  alive: boolean;
  hit: (a: AreaEffect) => void;
}
/** Authority ticks semantic areas once. Cosmetics and per-particle state never enter this system. */
export class AreaEffects {
  active: AreaEffect[] = [];
  private next = 0;
  private ticks = new Map<number, Map<number, number>>();
  clear(): void {
    this.active.length = 0;
    this.ticks.clear();
  }
  spawn(
    biome: number,
    source: number,
    x: number,
    y: number,
    time: number,
    players = 1,
    from = { x, y },
  ): AreaEffect | undefined {
    for (const a of this.active) if (time >= a.expireAt) this.ticks.delete(a.id);
    this.active = this.active.filter((a) => time < a.expireAt);
    if (this.active.length >= areaCap(players)) return;
    const kind = AREA_KINDS[biome],
      rule = AREA_RULES[kind];
    if (!rule) return;
    const a: AreaEffect = {
      id: ++this.next,
      source,
      biome,
      kind,
      team: 'enemy',
      x,
      y,
      fromX: from.x,
      fromY: from.y,
      radius: rule.radius,
      warningRadius: rule.radius,
      createdAt: time,
      armAt: time + rule.warning,
      expireAt: time + rule.warning + rule.duration,
      damage: rule.damage,
      postureDamage: rule.posture,
      tickRate: rule.tick,
      status: rule.status,
    };
    this.active.push(a);
    return a;
  }
  update(time: number, targets: readonly AreaTarget[]): void {
    for (const a of this.active) {
      if (time >= a.expireAt) {
        this.ticks.delete(a.id);
        continue;
      }
      if (time < a.armAt) continue;
      let hits = this.ticks.get(a.id);
      if (!hits) {
        hits = new Map();
        this.ticks.set(a.id, hits);
      }
      const tick = Math.floor((time - a.armAt + 1e-7) / a.tickRate);
      for (const target of targets) {
        if (!target.alive || target.team === a.team || !areaContains(a, target.x, target.y, time))
          continue;
        // Record before callback: no duplicate ticks on re-entry, lag or reentrant damage handling.
        if ((hits.get(target.id) ?? -1) >= tick) continue;
        hits.set(target.id, tick);
        target.hit(a);
      }
    }
    this.active = this.active.filter((a) => time < a.expireAt + 0.65);
  }
}
