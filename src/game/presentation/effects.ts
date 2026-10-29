import * as T from 'three';
import { World, type Effect } from '../world';
import { globalPosition } from './architecture';
import { Materials, SCALE } from './materials';
import { createWeaponEffect, updateWeaponEffect } from './weapon-effects';
import { EXECUTION_CONTACT, EXECUTION_DURATION } from '../executions';
import { GRAPHICS } from '../graphics';

export class Effects {
  readonly root = new T.Group();
  readonly light = new T.PointLight('#ffd18a', 0, 12, 1.5);
  private particles: T.LineSegments;
  private positions = new Float32Array(520 * 6);
  private colors = new Float32Array(520 * 6);
  private active = new Map<Effect, T.Group>();
  private pool = new Map<string, T.Group[]>();
  private rings: T.Mesh[] = [];
  private materialsGlow: T.CanvasTexture;
  private flashSprite: T.Sprite;
  private hazard: T.Mesh;
  private spikes = new T.Group();
  constructor(
    private world: World,
    materials: Materials,
  ) {
    this.materialsGlow = materials.glow;
    const geo = new T.BufferGeometry();
    geo.setAttribute(
      'position',
      new T.BufferAttribute(this.positions, 3).setUsage(T.DynamicDrawUsage),
    );
    geo.setAttribute('color', new T.BufferAttribute(this.colors, 3).setUsage(T.DynamicDrawUsage));
    this.particles = new T.LineSegments(
      geo,
      new T.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.particles.frustumCulled = false;
    this.root.add(this.particles, this.light);
    const flash = new T.Sprite(
      new T.SpriteMaterial({
        map: materials.glow,
        color: '#ffd59a',
        transparent: true,
        opacity: 0.4,
        blending: T.AdditiveBlending,
        depthWrite: false,
      }),
    );
    flash.scale.set(1.4, 1.4, 1);
    this.light.add(flash);
    this.flashSprite = flash;
    flash.visible = false;
    for (let i = 0; i < 3; i++) {
      const ring = new T.Mesh(
        new T.RingGeometry(0.8, 1, 64),
        new T.MeshBasicMaterial({
          color: '#c5eddf',
          side: T.DoubleSide,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: T.AdditiveBlending,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      this.root.add(ring);
      this.rings.push(ring);
    }
    this.hazard = new T.Mesh(
      new T.CircleGeometry(1, 40),
      new T.MeshBasicMaterial({
        color: '#d88f45',
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    );
    this.hazard.rotation.x = -Math.PI / 2;
    this.root.add(this.hazard, this.spikes);
    for (let i = 0; i < 35; i++) {
      const spike = new T.Mesh(materials.cone, materials.items.iron);
      spike.position.set(((i % 5) - 2) * 0.9, 0, (Math.floor(i / 5) - 3) * 1.1);
      spike.scale.set(0.18, 0.6, 0.18);
      spike.castShadow = true;
      this.spikes.add(spike);
    }
  }
  update(_camera: T.Camera, duel: number): void {
    const w = this.world;
    const trap = w.room.kind === 'hazard',
      biomes = [w.floor.biome, w.floor.hybrid],
      environment = biomes.includes(4) ? 4 : biomes.includes(2) ? 2 : biomes.includes(3) ? 3 : -1;
    this.hazard.visible = trap || environment >= 0;
    this.spikes.visible = trap;
    const active = w.time % 5 > 3.4,
      warning = w.time % 5 > 2.5;
    this.hazard.position.copy(globalPosition(w.room, 560, trap ? 380 : 250, 0.035));
    this.hazard.scale.set(
      trap ? 2.75 : environment === 2 ? 2.5 : 1.625,
      trap ? 4.5 : environment === 2 ? 2.5 : 1.625,
      1,
    );
    const mat = this.hazard.material as T.MeshBasicMaterial;
    mat.color.set(
      environment === 3 && !trap
        ? '#b0d9e4'
        : environment === 2 && !trap
          ? '#a36ac3'
          : active
            ? '#e7703a'
            : '#bca266',
    );
    mat.opacity = environment === 3 && !trap ? 0.14 : active ? 0.3 : warning ? 0.17 : 0.065;
    this.spikes.position.copy(
      globalPosition(w.room, 560, 380, active ? 0.12 : warning ? -0.13 : -0.4),
    );
    const particles = w.particles.filter((p) => !p.contact).slice(0, 520);
    particles.forEach((p, i) => {
      const life = p.life / p.maxLife,
        t = 1 - life,
        pos = globalPosition(
          w.room,
          p.x,
          p.y,
          (p.ground ? 0.07 : 1.1) + Math.sin(t * Math.PI) * (p.ground ? 0.12 : 0.5),
        ),
        color = new T.Color(p.color).multiplyScalar((p.ground ? 0.6 : 0.85) * life);
      this.positions.set(
        [
          pos.x,
          pos.y,
          pos.z,
          pos.x - p.vx * SCALE * 0.035,
          pos.y - 0.02,
          pos.z - p.vy * SCALE * 0.035,
        ],
        i * 6,
      );
      this.colors.set(
        [color.r, color.g, color.b, color.r * life, color.g * life, color.b * life],
        i * 6,
      );
    });
    this.particles.geometry.setDrawRange(0, particles.length * 2);
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;
    for (const [e, mesh] of this.active)
      if (!w.effects.includes(e)) {
        const key = mesh.userData.poolKey as string;
        const free = this.pool.get(key) ?? [];
        if (
          free.length < 3 &&
          [...this.pool.values()].reduce((sum, groups) => sum + groups.length, 0) < 64
        ) {
          mesh.visible = false;
          free.push(mesh);
          this.pool.set(key, free);
        } else {
          this.root.remove(mesh);
          mesh.traverse((o) => {
            if (o instanceof T.Mesh || o instanceof T.LineSegments) {
              o.geometry.dispose();
              (o.material as T.Material).dispose();
            } else if (o instanceof T.Sprite) o.material.dispose();
          });
        }
        this.active.delete(e);
      }
    let flash = 0;
    for (const e of w.effects) {
      let mesh = this.active.get(e);
      const rawTime = 1 - e.life / e.maxLife;
      const contactAt = (EXECUTION_DURATION * EXECUTION_CONTACT) / e.maxLife;
      const t =
        e.kind === 'finish' ? Math.max(0, (rawTime - contactAt) / (1 - contactAt)) : rawTime;
      if (!mesh) {
        const density = GRAPHICS[w.save.settings.detail].particles;
        const key = [
          e.kind,
          e.weapon,
          e.attackKind,
          e.projectileKind,
          e.contact,
          e.scale.toFixed(2),
          e.color,
          density,
        ].join(':');
        mesh = this.pool.get(key)?.pop() ?? createWeaponEffect(e, this.materialsGlow, density);
        mesh.userData.poolKey = key;
        if (!mesh.parent) this.root.add(mesh);
        this.active.set(e, mesh);
      }
      const ground = e.kind === 'ring' && !e.contact;
      mesh.position.copy(
        globalPosition(
          w.room,
          e.x,
          e.y,
          ground ? 0.09 : e.projectileKind ? 0.95 : e.attackKind === 'sweep' ? 0.5 : 1.25,
        ),
      );
      mesh.visible = e.kind !== 'finish' || rawTime >= contactAt;
      updateWeaponEffect(mesh, e, t, w.save.settings.reducedMotion, w.save.settings.flashes);
      if (e.kind === 'perfect') {
        flash = Math.max(flash, Math.max(0, 1 - t * 5) * Math.min(1.4, e.scale));
        this.light.position.copy(mesh.position);
      }
    }
    this.light.intensity = w.save.settings.flashes ? Math.min(2.5, flash * 2) : 0;
    this.flashSprite.visible = w.save.settings.flashes && flash > 0;
    this.flashSprite.material.opacity = Math.min(0.22, flash * 0.15);
    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i],
        enemy = w.alive[i];
      ring.visible = !!enemy && enemy.state === 'tell';
      if (enemy && ring.visible) {
        const t = Math.min(1, (w.time - enemy.stateAt) / enemy.strike.windup),
          special = ['smash', 'sweep', 'grab'].includes(enemy.strike.kind);
        ring.position.copy(globalPosition(w.room, enemy.x, enemy.y, 0.04));
        ring.scale.setScalar(enemy.strike.reach * SCALE * (0.45 + t * 0.55));
        const mat = ring.material as T.MeshBasicMaterial;
        mat.color.set(special ? '#e34d37' : '#eeb862');
        mat.opacity = (special ? 0.18 : 0.1) * (duel > 0.5 ? 0.7 : 1);
      }
    }
  }
  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof T.Mesh || o instanceof T.LineSegments) {
        if (o.parent !== this.spikes) o.geometry.dispose();
        if (o.parent !== this.spikes) (o.material as T.Material).dispose();
      } else if (o instanceof T.Sprite) o.material.dispose();
    });
  }
}
