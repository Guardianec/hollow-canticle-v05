import { canStand } from './geometry';
import type { Obstacle, Room } from './dungeon';
export type ProjectileKind = 'arrow' | 'orb' | 'needle' | 'knife' | 'javelin' | 'wave';
export interface Point {
  x: number;
  y: number;
}
export interface Projectile extends Point {
  id: number;
  vx: number;
  vy: number;
  radius: number;
  owner: number | string;
  team: string;
  damage: number;
  postureDamage: number;
  lifetime: number;
  parryable: boolean;
  reflectable: boolean;
  reflected: boolean;
  kind: ProjectileKind;
  visualType: ProjectileKind;
  pierce: number;
  hit: (number | string)[];
}
export interface ProjectileTarget extends Point {
  id: number | string;
  team: string;
  radius: number;
}
/** First swept circle contact, including a projectile already overlapping the target. */
export function segmentContact(
  a: Point,
  b: Point,
  target: Point,
  radius: number,
): number | undefined {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    ox = a.x - target.x,
    oy = a.y - target.y;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return 0;
  const length = dx * dx + dy * dy;
  if (!length) return;
  const dot = ox * dx + oy * dy,
    discriminant = dot * dot - length * c;
  if (discriminant < 0) return;
  const t = (-dot - Math.sqrt(discriminant)) / length;
  if (t >= 0 && t <= 1) return t;
}
export function wallContact(
  room: Room,
  obstacles: Obstacle[],
  a: Point,
  b: Point,
  radius: number,
): number | undefined {
  let contact = Infinity;
  for (const o of obstacles) {
    const t = segmentContact(a, b, o, radius + o.radius);
    if (t !== undefined) contact = Math.min(contact, t);
  }
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!canStand(room, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, radius)) {
      contact = Math.min(contact, t);
      break;
    }
  }
  return contact === Infinity ? undefined : contact;
}
export function lineOfSight(room: Room, obstacles: Obstacle[], a: Point, b: Point): boolean {
  return wallContact(room, obstacles, a, b, 3) === undefined;
}
export class Projectiles {
  active: Projectile[] = [];
  private serial = 0;
  spawn(def: Omit<Projectile, 'id' | 'hit' | 'visualType' | 'reflected'>): Projectile | undefined {
    if (this.active.length >= 48) return;
    const p = { ...def, id: this.serial++, hit: [], visualType: def.kind, reflected: false };
    this.active.push(p);
    return p;
  }
  update(
    dt: number,
    room: Room,
    obstacles: Obstacle[],
    targets: ProjectileTarget[],
    hit: (shot: Projectile, target: ProjectileTarget) => void,
    wallHit: (shot: Projectile) => void,
  ): void {
    for (const shot of this.active) {
      shot.lifetime -= dt;
      if (shot.lifetime <= 0) continue;
      const end = { x: shot.x + shot.vx * dt, y: shot.y + shot.vy * dt };
      const wall = wallContact(room, obstacles, shot, end, shot.radius);
      const contacts = targets
        .filter((target) => target.team !== shot.team && !shot.hit.includes(target.id))
        .map((target) => ({
          target,
          t: segmentContact(shot, end, target, shot.radius + target.radius),
        }))
        .filter(
          (contact): contact is { target: ProjectileTarget; t: number } => contact.t !== undefined,
        )
        .sort((a, b) => a.t - b.t);
      const contact = contacts[0],
        t = Math.min(wall ?? 1, contact?.t ?? 1);
      shot.x += (end.x - shot.x) * t;
      shot.y += (end.y - shot.y) * t;
      if (wall !== undefined && wall <= (contact?.t ?? 1)) {
        shot.lifetime = 0;
        wallHit(shot);
      } else if (contact) hit(shot, contact.target);
    }
    this.active = this.active.filter((s) => s.lifetime > 0);
  }
  clear(): void {
    this.active = [];
    this.serial = 0;
  }
}
