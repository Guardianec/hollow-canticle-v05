import * as T from 'three';
import { World } from '../world';
import { ITEMS } from '../items';
import { globalPosition } from './architecture';

/** Fixed pools: no geometry or material creation in the draw loop. */
export class ArsenalArt {
  readonly root = new T.Group();
  private arrows: T.Group[] = [];
  private pickups: T.Group[] = [];
  private geometry = [
    new T.CylinderGeometry(0.025, 0.025, 0.65, 5),
    new T.ConeGeometry(0.075, 0.19, 5),
    new T.SphereGeometry(0.17, 10, 8),
    new T.TorusGeometry(0.27, 0.025, 5, 20),
    new T.BoxGeometry(0.2, 0.28, 0.15),
  ];
  private materials: T.MeshBasicMaterial[] = [];
  private warnings = document.createElement('div');
  private pathPositions = new Float32Array(48 * 6);
  private paths = new T.LineSegments(
    new T.BufferGeometry(),
    new T.LineBasicMaterial({ color: '#c5eab3', transparent: true, opacity: 0.7 }),
  );
  constructor(
    private world: World,
    parent: HTMLElement,
  ) {
    this.paths.geometry.setAttribute('position', new T.BufferAttribute(this.pathPositions, 3));
    this.paths.frustumCulled = false;
    this.root.add(this.paths);
    this.warnings.className = 'projectile-warnings';
    parent.append(this.warnings);
    for (let i = 0; i < 48; i++) {
      const group = new T.Group(),
        material = new T.MeshBasicMaterial({ color: '#e0b98b' });
      this.materials.push(material);
      const shaft = new T.Mesh(this.geometry[0], material);
      shaft.rotation.z = Math.PI / 2;
      const tip = new T.Mesh(this.geometry[1], material);
      tip.rotation.z = -Math.PI / 2;
      tip.position.x = 0.4;
      const orb = new T.Mesh(this.geometry[2], material);
      const ring = new T.Mesh(this.geometry[3], material);
      ring.rotation.x = -Math.PI / 2;
      const trail = new T.Mesh(this.geometry[0], material);
      trail.rotation.z = Math.PI / 2;
      trail.scale.set(0.35, 2.2, 0.35);
      trail.position.x = -0.8;
      const shadow = new T.Mesh(this.geometry[3], material);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = -0.75;
      shadow.scale.setScalar(0.4);
      group.add(shaft, tip, orb, ring, trail, shadow);
      this.root.add(group);
      this.arrows.push(group);
    }
    for (let i = 0; i < 12; i++) {
      const group = new T.Group(),
        material = new T.MeshBasicMaterial({ color: '#df9f91' });
      this.materials.push(material);
      const vial = new T.Mesh(this.geometry[2], material);
      vial.scale.set(0.75, 1.3, 0.75);
      const neck = new T.Mesh(this.geometry[0], material);
      neck.scale.set(2, 0.3, 2);
      neck.position.y = 0.25;
      const pouch = new T.Mesh(this.geometry[4], material);
      const incense = new T.Mesh(this.geometry[0], material);
      incense.scale.set(1.3, 0.9, 1.3);
      const halo = new T.Mesh(this.geometry[3], material);
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = -0.2;
      halo.scale.setScalar(1.4);
      group.add(vial, neck, pouch, incense, halo);
      this.root.add(group);
      this.pickups.push(group);
    }
  }
  update(camera: T.Camera): void {
    const w = this.world,
      warnings: string[] = [];
    this.arrows.forEach((group, i) => {
      const p = w.projectiles.active[i];
      group.visible = !!p;
      if (!p) return;
      group.position.copy(globalPosition(w.room, p.x, p.y));
      group.position.y += p.kind === 'wave' ? 0.15 : 0.95;
      group.rotation.y = -Math.atan2(p.vy, p.vx);
      const magic = p.kind === 'orb',
        wave = p.kind === 'wave';
      group.children[0].visible = group.children[1].visible = !magic && !wave;
      group.children[2].visible = magic;
      group.children[3].visible = magic || wave;
      group.children[2].scale.setScalar(p.radius / 13);
      group.children[3].scale.setScalar(wave ? 1.8 : 0.9);
      (group.children[0] as T.Mesh).scale.y =
        p.kind === 'javelin' ? 2 : p.kind === 'knife' ? 0.6 : 1;
      this.materials[i].color.set(
        p.reflected
          ? magic
            ? '#f1c9e9'
            : '#fff1c3'
          : p.team === 'player'
            ? w.character.color
            : magic
              ? '#9aeddc'
              : '#f0b875',
      );
      const projected = group.position.clone().project(camera);
      const endpoint = globalPosition(w.room, p.x + p.vx * 0.6, p.y + p.vy * 0.6);
      endpoint.y += 0.95;
      this.pathPositions.set(
        [group.position.x, group.position.y, group.position.z, endpoint.x, endpoint.y, endpoint.z],
        i * 6,
      );
      if (
        p.team === 'enemy' &&
        (Math.abs(projected.x) > 0.88 || Math.abs(projected.y) > 0.88 || projected.z > 1)
      ) {
        const x = T.MathUtils.clamp(projected.x, -0.92, 0.92),
          y = T.MathUtils.clamp(projected.y, -0.88, 0.88);
        warnings.push(
          `<i aria-label="Incoming ${magic ? 'orb' : 'arrow'}" style="left:${(x + 1) * 50}%;top:${(1 - y) * 50}%;transform:rotate(${Math.atan2(p.vy, p.vx)}rad)">‹</i>`,
        );
      }
      group.children[5].visible = w.debug && w.lab.hitboxes;
      group.children[5].scale.setScalar((p.radius * 0.025) / 0.27);
    });
    this.paths.visible = w.debug && w.lab.hitboxes;
    this.paths.geometry.setDrawRange(0, w.projectiles.active.length * 2);
    this.paths.geometry.attributes.position.needsUpdate = true;
    this.warnings.innerHTML = w.mode === 'playing' ? warnings.join('') : '';
    const pickups = w.pickups.filter((p) => p.room === w.roomId && p.depth === w.floor.depth);
    this.pickups.forEach((group, i) => {
      const pickup = pickups[i];
      group.visible = !!pickup;
      if (!pickup) return;
      const item = ITEMS.find((d) => d.id === pickup.item)!;
      group.position.copy(globalPosition(w.room, pickup.x, pickup.y));
      group.position.y += 0.3;
      this.materials[48 + i].color.set(item.color);
      group.children[0].visible = group.children[1].visible = item.model === 'vial';
      group.children[2].visible = item.model === 'pouch';
      group.children[3].visible = item.model === 'incense';
      group.children[4].rotation.z = w.save.settings.reducedMotion ? 0 : w.visualTime * 0.3;
    });
  }
  dispose(): void {
    this.paths.geometry.dispose();
    (this.paths.material as T.Material).dispose();
    this.geometry.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.warnings.remove();
  }
}
