import * as T from 'three';
import { World, distance } from '../world';
import { globalPosition } from './architecture';
import { elevationAt } from '../geometry';

export class CameraDirector {
  readonly camera = new T.PerspectiveCamera(38, 1, 0.12, 250);
  duel = 0;
  mode = 'exploration';
  private look = new T.Vector3();
  private initialized = false;
  private engagementDirection = new T.Vector3(1, 0, 0);
  private wasDuel = false;
  entryRemaining = 0;
  private ray = new T.Raycaster();
  private floor = new T.Plane(new T.Vector3(0, 1, 0), 0);
  private pointer = new T.Vector2();
  constructor(private world: World) {}
  reset() {
    this.initialized = false;
    this.duel = 0;
    this.wasDuel = false;
    this.entryRemaining = 0;
  }
  update(dt: number, playerPosition: T.Vector3): void {
    const w = this.world,
      finishing = w.player.state === 'finisher' || w.effects.some((e) => e.kind === 'finish'),
      target = w.target ?? (finishing ? w.enemies.find((e) => e.state === 'dead') : undefined),
      menu = w.mode === 'menu';
    const significant = !!target;
    const close =
      w.debug && w.lab.camera !== 'auto'
        ? w.lab.camera !== 'exploration'
        : ((significant && distance(w.player, target!) < 300) || finishing) && !menu;
    if (close && !this.wasDuel && target) {
      this.engagementDirection = globalPosition(w.room, target.x, target.y)
        .sub(playerPosition)
        .setY(0)
        .normalize();
      this.entryRemaining = 0.7;
    }
    this.entryRemaining = Math.max(0, this.entryRemaining - dt);
    this.wasDuel = close;
    this.duel = T.MathUtils.damp(
      this.duel,
      close ? 1 : 0,
      w.save.settings.reducedMotion ? 2.8 : finishing ? 7 : 3.8,
      dt,
    );
    const labSnapshot = w.debug && w.timeScale === 0 && w.lab.camera !== 'auto';
    if (labSnapshot) this.duel = close ? 1 : 0;
    const incoming = w.projectiles.active.filter((p) => p.team === 'enemy');
    const group =
      w.alive.length > 1 ||
      incoming.length > 0 ||
      w.areas.active.length > 0 ||
      w.alive.some((e) => ['archer', 'hexer'].includes(e.def.id)) ||
      w.lab.camera === 'combat-wide';
    const bossMode = target?.def.id === 'boss' || w.lab.camera === 'boss';
    this.mode =
      this.duel > 0.5
        ? finishing
          ? 'finisher'
          : group
            ? 'combat-wide'
            : bossMode
              ? 'boss'
              : 'duel'
        : 'exploration';
    const exploreLook = playerPosition.clone().add(new T.Vector3(0, 0.3, 0));
    const explorePosition = exploreLook.clone().add(new T.Vector3(12.5, 19, 15));
    if (menu) {
      exploreLook.add(new T.Vector3(1.5, 0, -1.5));
      explorePosition.add(new T.Vector3(1.5, 0, -1.5));
    }
    const dir = this.engagementDirection,
      side = new T.Vector3(-dir.z, 0, dir.x);
    const enemyPosition = target
      ? globalPosition(w.room, target.x, target.y)
      : playerPosition.clone().add(dir);
    const focus = playerPosition
      .clone()
      .lerp(enemyPosition, 0.56)
      .add(new T.Vector3(0, bossMode ? 2.8 : 1.05, 0));
    const boss = target?.def.id === 'boss';
    const duelPosition = focus
      .clone()
      .addScaledVector(dir, -(boss ? 4.4 : 1.7))
      .addScaledVector(side, boss ? 10 : 4.8)
      .add(new T.Vector3(0, boss ? 4.2 : 1, 0));
    if (group && !finishing) {
      const points = [
        playerPosition,
        ...w.alive.map((e) => globalPosition(w.room, e.x, e.y)),
        ...incoming.map((p) => globalPosition(w.room, p.x, p.y)),
        ...w.areas.active.flatMap((a) => [
          globalPosition(w.room, a.x - a.radius, a.y),
          globalPosition(w.room, a.x + a.radius, a.y),
        ]),
      ];
      focus.set(0, 0, 0);
      points.forEach((p) => focus.add(p));
      focus.divideScalar(points.length);
      const radius = Math.max(3.5, ...points.map((p) => p.distanceTo(focus) + 1.7));
      const fit = radius / Math.sin((23 * Math.PI) / 180) / Math.min(1, this.camera.aspect);
      duelPosition.copy(focus).add(new T.Vector3(0.48, 0.65, 0.6).normalize().multiplyScalar(fit));
      focus.y += 0.8;
    }
    if (w.player.state === 'finisher' && !w.save.settings.reducedMotion) {
      const preset = w.weapon.id === 'spear' ? 0.7 : w.weapon.id === 'great' ? -0.6 : 0.2;
      duelPosition.addScaledVector(side, preset + Math.sin((w.time - w.player.stateAt) * 2) * 0.3);
      duelPosition.y -= w.weapon.id === 'great' ? 0.25 : 0.1;
      focus.y = 1.15 + playerPosition.y;
    }
    const desiredPosition = explorePosition.lerp(duelPosition, this.duel),
      desiredLook = exploreLook.lerp(focus, this.duel);
    if (!this.initialized || labSnapshot) {
      this.camera.position.copy(desiredPosition);
      this.look.copy(desiredLook);
      this.initialized = true;
    }
    const smoothing = w.save.settings.reducedMotion ? 3.5 : 6;
    this.camera.position.lerp(desiredPosition, 1 - Math.exp(-dt * smoothing));
    this.look.lerp(desiredLook, 1 - Math.exp(-dt * smoothing));
    if (w.save.settings.shake && !w.save.settings.reducedMotion && w.shake > 0) {
      const amount = w.shake * 0.014 * Math.exp(-Math.max(0, dt) * 12);
      this.camera.position.addScaledVector(dir, Math.sin(w.visualTime * 43) * amount);
      this.camera.position.y += Math.sin(w.visualTime * 37) * amount * 0.4;
    }
    this.camera.fov = T.MathUtils.lerp(38, group ? 46 : 43, this.duel);
    this.camera.lookAt(this.look);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }
  resize(width: number, height: number) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
  screenToWorld(x: number, y: number, width: number, height: number): { x: number; y: number } {
    this.pointer.set((x / width) * 2 - 1, 1 - (y / height) * 2);
    this.ray.setFromCamera(this.pointer, this.camera);
    const intersection = new T.Vector3();
    let result = { x: this.world.player.x, y: this.world.player.y };
    for (let i = 0; i < 4; i++) {
      this.floor.constant = -elevationAt(this.world.room, result.x, result.y) * 0.025;
      if (!this.ray.ray.intersectPlane(this.floor, intersection)) return result;
      result = {
        x: intersection.x / 0.025 - this.world.room.x * 1200 + 560,
        y: intersection.z / 0.025 - this.world.room.y * 840 + 380,
      };
    }
    return result;
  }
  movement(x: number, y: number): { x: number; y: number } {
    const forward = new T.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = forward.clone().cross(new T.Vector3(0, 1, 0));
    return { x: right.x * x - forward.x * y, y: right.z * x - forward.z * y };
  }
}
