import { BALANCE, type Strike } from './data';
import { resolveDefense } from './combat';
import { lineOfSight, segmentContact, type Projectile, type ProjectileTarget } from './projectiles';
import { distance, type Enemy, type World } from './world';
import { pathBetween } from './geometry';

interface ArsenalHooks {
  move(body: { x: number; y: number }, dx: number, dy: number): void;
  hurt(amount: number, reason: string): void;
  beginTell(enemy: Enemy): void;
  breakEnemy(enemy: Enemy): void;
}

/** Simulation-side ranged behavior; presentation only reads its resulting state. */
export class Arsenal {
  constructor(
    private world: World,
    private hooks: ArsenalHooks,
  ) {}
  firePlayer(): void {
    const w = this.world;
    const p = w.player,
      r = w.character.ranged;
    w.projectiles.spawn({
      x: p.x + Math.cos(p.facing) * 28,
      y: p.y + Math.sin(p.facing) * 28,
      vx: Math.cos(p.facing) * r.speed,
      vy: Math.sin(p.facing) * r.speed,
      radius: r.radius,
      owner: w.network ? `p:${w.network.id}` : 'player',
      team: w.network?.team ?? 'player',
      damage: r.damage * w.buffs.modifier('damage') * (w.hasRelic('glass-arrow') ? 1.4 : 1),
      postureDamage: r.pressure * w.buffs.modifier('pressure'),
      lifetime: r.lifetime,
      parryable: Boolean(w.network?.strike),
      reflectable: Boolean(w.network?.strike),
      kind: r.kind,
      pierce: r.pierce,
    });
    w.audio.play('ranged', w.weapon.id);
    if (r.kind === 'wave') w.environmentImpact(p.x, p.y, 1.1);
  }

  private enemyProjectileSpeed(kind: 'arrow' | 'orb'): number {
    const w = this.world;
    return (kind === 'arrow' ? 350 : 185) * (w.debug ? w.lab.projectileSpeed : 1);
  }
  travel(strike: Strike, dist: number): number {
    const kind = strike.projectile!;
    const radius = strike.projectileRadius ?? (kind === 'arrow' ? 5 : 13);
    return Math.max(0, dist - 30 - 19 - radius) / this.enemyProjectileSpeed(kind);
  }

  fireEnemy(e: Enemy): void {
    const w = this.world;
    const kind =
      w.debug && ['arrow', 'orb'].includes(w.lab.projectileType)
        ? (w.lab.projectileType as 'arrow' | 'orb')
        : e.strike.projectile!;
    const start = { x: e.x + Math.cos(e.facing) * 30, y: e.y + Math.sin(e.facing) * 30 };
    // Recheck the committed firing lane; an ally crossing it cancels release.
    const end = { x: start.x + Math.cos(e.facing) * 650, y: start.y + Math.sin(e.facing) * 650 };
    if (
      !lineOfSight(w.room, w.obstacles, e, start) ||
      w.alive.some(
        (o) =>
          o !== e &&
          segmentContact(start, end, o, 28) !== undefined &&
          distance(e, o) < distance(e, w.player),
      )
    )
      return;
    w.projectiles.spawn({
      ...start,
      vx: Math.cos(e.facing) * this.enemyProjectileSpeed(kind),
      vy: Math.sin(e.facing) * this.enemyProjectileSpeed(kind),
      radius: e.strike.projectileRadius ?? (kind === 'arrow' ? 5 : 13),
      owner: e.id,
      team: 'enemy',
      damage: e.strike.damage,
      postureDamage: 30,
      lifetime: 5,
      parryable: true,
      reflectable: true,
      kind,
      pierce: 0,
    });
    w.audio.play('release', kind);
  }

  updateEnemy(e: Enemy, dt: number): void {
    const w = this.world;
    const p = w.player,
      dist = distance(e, p),
      sight = lineOfSight(w.room, w.obstacles, e, p);
    if (dist < 240 || !sight || dist > 560) {
      let angle =
        dist < 240 ? e.facing + Math.PI : !sight ? e.facing + (e.id % 2 ? -1 : 1) * 0.85 : e.facing;
      if (!sight) {
        if (e.pathAt === undefined || w.time - e.pathAt > 0.6) {
          e.path = pathBetween(w.room, e, p);
          e.pathAt = w.time;
        }
        while (e.path?.length && distance(e, e.path[0]) < 24) e.path.shift();
        if (e.path?.[0]) angle = Math.atan2(e.path[0].y - e.y, e.path[0].x - e.x);
      }
      const before = { x: e.x, y: e.y };
      this.hooks.move(e, Math.cos(angle) * e.def.speed * dt, Math.sin(angle) * e.def.speed * dt);
      const stuck = distance(before, e) < dt * 5;
      if (stuck && dist < 240)
        this.hooks.move(
          e,
          Math.cos(angle + Math.PI / 2) * e.def.speed * dt,
          Math.sin(angle + Math.PI / 2) * e.def.speed * dt,
        );
      if (stuck && dist < 150 && w.time >= e.readyAt) {
        e.strike = { kind: 'slash', windup: 0.75, recovery: 1.2, damage: 8, reach: 90 };
        this.hooks.beginTell(e);
        return;
      }
      if ((dist < 240 && !stuck) || !sight) return;
    }
    if (w.time < e.readyAt || p.state === 'finisher' || dist < 160) return;
    if (w.alive.some((o) => o !== e && segmentContact(e, p, o, 30) !== undefined)) return;
    const pattern =
      w.debug && w.lab.pattern >= 0 ? w.lab.pattern : e.variant % e.def.patterns.length;
    const strike = { ...e.def.patterns[pattern % e.def.patterns.length][0] };
    if (
      !w.threats.reserve(
        e.id,
        w.time,
        strike,
        w.floor.depth,
        this.travel(strike, dist),
        w.network?.id,
      )
    )
      return;
    e.strike = strike;
    e.variant++;
    this.hooks.beginTell(e);
  }

  update(dt: number): void {
    const w = this.world;
    const p = w.player;
    const targets = [
      ...(w.network
        ? w.network.active().map((other) => ({
            ...other.player,
            id: `p:${other.network!.id}`,
            team: other.network!.team,
            radius: 19,
          }))
        : [{ ...p, id: 'player', team: 'player', radius: 19 }]),
      ...w.alive
        .filter((e) => e.state !== 'broken')
        .filter(() => !w.network?.strike)
        .map((e) => ({ ...e, team: 'enemy' as const, radius: 22 * e.def.scale })),
    ];
    w.projectiles.update(
      dt,
      w.room,
      w.obstacles,
      targets,
      (shot, target) => {
        const recipient =
          w.network?.owner(typeof target.id === 'string' ? target.id : shot.owner) ?? w;
        recipient.arsenal.hitProjectile(shot, target);
      },
      (shot) =>
        w.impact(shot.x, shot.y, shot.kind === 'orb' ? '#a8cfd9' : '#d9bf91', 6, 'ring', 0.3),
    );
  }

  hitProjectile(shot: Projectile, target: ProjectileTarget): void {
    const w = this.world,
      p = w.player;
    const enemyTarget =
      typeof target.id === 'string' ? undefined : w.enemies.find((e) => e.id === target.id);
    if (enemyTarget) {
      const enemy = enemyTarget;
      const previousPosture = enemy.posture;
      shot.hit.push(enemy.id);
      enemy.hp -= shot.damage;
      w.pressure(
        enemy,
        shot.postureDamage * (w.hasRelic('hunter') && enemy.state === 'tell' ? 1.3 : 1),
      );
      if (enemy.hp <= 0) this.hooks.breakEnemy(enemy);
      w.network?.hit?.(enemy, shot.damage, Math.max(0, enemy.posture - previousPosture));
      if (['archer', 'hexer'].includes(enemy.def.id) && enemy.state === 'tell') {
        enemy.state = 'recover';
        enemy.stateAt = w.time;
        enemy.readyAt = w.time + 0.7;
        w.threats.release(enemy.id);
      }
      enemy.recoilAt = w.time;
      w.stats.rangedHits++;
      w.impact(
        shot.x,
        shot.y,
        shot.reflected ? '#fff0bf' : w.character.color,
        14,
        shot.reflected ? 'perfect' : 'ring',
        0.7,
        true,
        Math.atan2(shot.vy, shot.vx),
      );
      w.audio.play('hit', shot.kind);
      if (shot.pierce-- <= 0) shot.lifetime = 0;
      return;
    }
    if (
      p.state === 'finisher' ||
      w.time < p.immunity ||
      (w.time - p.dodgeAt >= 0 && w.time - p.dodgeAt <= BALANCE.dodgeInvulnerable)
    ) {
      shot.lifetime = 0;
      return;
    }
    const defense = resolveDefense({
      strike: { kind: 'thrust', windup: 0, recovery: 0, damage: shot.damage, reach: 100 },
      distance: 0,
      parryAge: shot.parryable ? w.time - p.parryAt : 99,
      dodgeAge: w.time - p.dodgeAt,
      weapon: w.weapon,
      assist: w.save.settings.assist || w.training,
      bonusWindow: w.bonusWindow,
    });
    if (defense === 'perfect' || defense === 'parry')
      this.parryProjectile(shot, defense === 'perfect');
    else {
      const before = { ...p };
      this.hooks.hurt(shot.damage, shot.kind === 'arrow' ? 'ASHEN ARROW' : 'RESONANT ORB');
      w.network?.projectileContact?.(shot, Math.max(0, before.hp - p.hp), before);
      shot.lifetime = 0;
    }
  }

  parryProjectile(shot: Projectile, perfect: boolean): void {
    const w = this.world;
    const p = w.player,
      magic = shot.kind === 'orb';
    w.stats.projectileParries++;
    w.stats.parries++;
    w.trainingDone.add('projectile');
    p.parryLanded = true;
    p.emptyParries = 0;
    p.focus += perfect ? 18 : 8;
    p.posture = Math.max(0, p.posture - (perfect ? 15 : 6));
    p.counterUntil = w.time + 0.8;
    p.state = 'idle';
    w.lastPerfect = perfect;
    w.impact(
      shot.x,
      shot.y,
      magic ? '#b5f7e4' : '#fff1c3',
      magic ? 35 : 16,
      perfect ? 'perfect' : 'ring',
      magic ? 1.4 : 0.7,
      true,
      Math.atan2(-shot.vy, -shot.vx),
    );
    w.effects[w.effects.length - 1].projectileKind = magic ? 'orb' : 'arrow';
    w.audio.play(perfect ? 'reflect' : 'deflect', magic ? 'orb' : 'arrow');
    w.hitStop = w.save.settings.reducedMotion ? 0.015 : magic && perfect ? 0.075 : 0.035;
    if (!perfect || !shot.reflectable) {
      shot.lifetime = 0;
      return;
    }
    w.stats.reflections++;
    w.stats.perfects++;
    w.trainingDone.add('reflection');
    if (w.weapon.id === 'sword') w.rechargeRanged(1);
    if (w.hasRelic('returning') && w.stats.reflections % 3 === 0)
      p.rangedCharges = Math.min(w.character.ranged.charges, p.rangedCharges + 1);
    const shooter = w.alive.find((e) => e.id === shot.owner);
    const target = shooter ?? w.target;
    const angle = target
      ? Math.atan2(target.y - shot.y, target.x - shot.x)
      : Math.atan2(-shot.vy, -shot.vx);
    const speed = Math.hypot(shot.vx, shot.vy) * 1.3;
    shot.vx = Math.cos(angle) * speed;
    shot.vy = Math.sin(angle) * speed;
    shot.team = w.network?.team ?? 'player';
    if (w.network) shot.owner = `p:${w.network.id}`;
    shot.reflected = true;
    shot.damage *= 1.6;
    shot.postureDamage = 62 * (w.weapon.id === 'spear' ? 1.2 : 1);
    shot.lifetime = 4;
    w.announce(
      magic ? 'RESONANCE RETURNED' : 'ARROW RETURNED',
      'Their own oath turns against them.',
      '#f4ddb0',
      1,
    );
  }
}
