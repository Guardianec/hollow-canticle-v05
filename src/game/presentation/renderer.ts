import * as T from 'three';
import { World } from '../world';
import type { Floor } from '../dungeon';
import { Materials } from './materials';
import { Actor } from './actors';
import { buildDungeon, globalPosition, type DungeonArt } from './architecture';
import { CameraDirector } from './camera';
import { Effects } from './effects';
import { Hud } from './hud';
import { Random } from '../random';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ArsenalArt } from './arsenal';
import { directionalFocus } from '../combat';
import { AssetManager } from './assets';
import { heightFog, FOG_COLORS, chasmMist, voidBackground } from './atmosphere';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BIOME_LIGHTING } from './lighting';

export class Renderer {
  readonly webgl: T.WebGLRenderer;
  readonly director: CameraDirector;
  private scene = new T.Scene();
  private materials = new Materials();
  private assets: AssetManager;
  private assetRevision = 0;
  private appliedQuality?: string;
  private mist: T.Mesh[] = [];
  private backgrounds = FOG_COLORS.map((_, i) => voidBackground(i));
  private environment: T.WebGLRenderTarget;
  private art?: DungeonArt;
  private floor?: Floor;
  private player: Actor;
  private arsenal: ArsenalArt;
  private actors = new Map<number, Actor>();
  private pilgrims = new Map<
    string,
    { actor: Actor; ring: T.Mesh<T.RingGeometry, T.MeshBasicMaterial>; weapon: string }
  >();
  private revision = -1;
  private hud: Hud;
  private effects: Effects;
  private lights: T.PointLight[] = [];
  private sun = new T.DirectionalLight('#b3d0ed', 1.6);
  private ambient = new T.HemisphereLight();
  private rim = new T.PointLight('#a9d8fa', 5.5, 10, 1.4);
  private fogSprites: T.Sprite[] = [];
  private observer: ResizeObserver;
  private previousPlayer = new T.Vector3();
  private travelFrom?: T.Vector3;
  private travel = 1;
  private frames = 0;
  private fpsAt = performance.now();
  private dust: T.Points;
  private dustPositions = new Float32Array(180 * 3);
  private dustRandom = new Random('ambient-particles');
  private lastStep = 0;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private output: OutputPass;
  private veil = document.createElement('div');
  private loadingNotice = document.createElement('div');
  loading = true;
  private fade = 0;
  constructor(
    private parent: HTMLElement,
    private world: World,
  ) {
    this.assets = new AssetManager(
      undefined,
      world.save.settings.detail === 'high',
      this.materials.playerPosition,
    );
    this.webgl = new T.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.webgl.setPixelRatio(Math.min(devicePixelRatio, world.save.settings.quality ? 1.5 : 1));
    this.webgl.shadowMap.enabled = true;
    this.webgl.shadowMap.type = T.PCFShadowMap;
    this.webgl.toneMapping = T.ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = 1.25;
    this.webgl.outputColorSpace = T.SRGBColorSpace;
    this.webgl.domElement.className = 'dungeon-webgl';
    parent.append(this.webgl.domElement);
    this.scene.background = this.backgrounds[0];
    const pmrem = new T.PMREMGenerator(this.webgl),
      room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.3;
    room.dispose();
    pmrem.dispose();
    this.scene.fog = new T.FogExp2(FOG_COLORS[0], 0.018);
    this.scene.add(this.ambient);
    for (const material of Object.values(this.materials.items))
      heightFog(material, this.assets.walkingHeight, this.assets.fogColor);
    this.sun.position.set(15, 35, 10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -22,
      right: 22,
      top: 22,
      bottom: -22,
      near: 0.5,
      far: 100,
    });
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target, this.rim);
    for (let i = 0; i < 6; i++) {
      const light = new T.PointLight('#ff9b40', 20, 8, 1.4);
      this.scene.add(light);
      this.lights.push(light);
    }
    this.director = new CameraDirector(world);
    this.player = new Actor(this.materials, 'player', true, this.assets);
    this.arsenal = new ArsenalArt(world, parent);
    this.scene.add(this.arsenal.root);
    this.scene.add(this.player.root);
    this.composer = new EffectComposer(this.webgl);
    this.composer.addPass(new RenderPass(this.scene, this.director.camera));
    this.bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.16, 0.24, 1.5);
    this.composer.addPass(this.bloom);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
    this.webgl.info.autoReset = false;
    this.effects = new Effects(world, this.materials);
    this.scene.add(this.effects.root);
    this.hud = new Hud(parent, world);
    this.veil.className = 'descent-veil';
    parent.append(this.veil);
    this.loadingNotice.className = 'asset-loading';
    this.loadingNotice.setAttribute('role', 'status');
    this.loadingNotice.textContent = 'Preparing the pilgrimage…';
    parent.append(this.loadingNotice);
    this.webgl.domElement.style.visibility = 'hidden';
    const dustGeo = new T.BufferGeometry();
    dustGeo.setAttribute(
      'position',
      new T.BufferAttribute(this.dustPositions, 3).setUsage(T.DynamicDrawUsage),
    );
    this.dust = new T.Points(
      dustGeo,
      new T.PointsMaterial({
        map: this.materials.glow,
        size: 0.11,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        color: '#c4c6b4',
        blending: T.AdditiveBlending,
      }),
    );
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    for (let i = 0; i < 3; i++) {
      const plane = new T.Mesh(
        new T.PlaneGeometry(130, 130),
        chasmMist(this.materials.time, this.assets.fogColor.value),
      );
      plane.rotation.x = -Math.PI / 2;
      this.scene.add(plane);
      this.mist.push(plane);
    }
    for (let i = 0; i < 9; i++) {
      const sprite = new T.Sprite(
        new T.SpriteMaterial({
          map: this.materials.glow,
          color: '#799bab',
          transparent: true,
          opacity: 0.13,
          depthWrite: false,
        }),
      );
      sprite.scale.set(28, 9, 1);
      this.scene.add(sprite);
      this.fogSprites.push(sprite);
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(parent);
    this.resize();
  }
  private resize() {
    const width = this.parent.clientWidth,
      height = this.parent.clientHeight;
    this.webgl.setSize(width, height);
    this.composer.setSize(width, height);
    this.director.resize(width, height);
  }
  screenToWorld(x: number, y: number) {
    return this.director.screenToWorld(x, y, this.parent.clientWidth, this.parent.clientHeight);
  }
  movement(x: number, y: number) {
    return this.director.movement(x, y);
  }
  get canvas() {
    return this.webgl.domElement;
  }
  draw(dt: number): void {
    const w = this.world;
    void this.assets.preloadBiome(w.floor.biome);
    this.loading = !this.assets.isBiomeSettled(w.floor.biome);
    this.loadingNotice.hidden = !this.loading;
    if (this.loading) {
      this.webgl.domElement.style.visibility = 'hidden';
      this.hud.root.hidden = true;
      return;
    }
    const lighting = BIOME_LIGHTING[w.floor.biome];
    this.ambient.color.set(lighting.sky);
    this.ambient.groundColor.set(lighting.ground);
    this.ambient.intensity = lighting.ambient;
    this.sun.color.set(lighting.moon);
    this.sun.intensity = lighting.sun;
    this.scene.environmentIntensity = lighting.environment;
    this.webgl.toneMappingExposure = lighting.exposure;
    this.rim.color.set(lighting.rim);
    (this.scene.fog as T.FogExp2).density = lighting.fog;
    void this.assets
      .setTextureQuality(w.save.settings.detail === 'high')
      .catch((error) => console.warn('Texture quality change failed', error));
    if (this.assets.revision !== this.assetRevision) {
      this.assetRevision = this.assets.revision;
      this.floor = undefined;
    }
    if (this.player.id !== `player-${w.weapon.id}`) {
      this.scene.remove(this.player.root);
      this.player.dispose();
      this.player = new Actor(this.materials, `player-${w.weapon.id}`, true, this.assets);
      this.scene.add(this.player.root);
    }
    this.player.setOutline(0);
    const changedFloor = this.floor !== w.floor;
    if (changedFloor) {
      if (this.floor) {
        this.fade = w.mode === 'playing' && !w.debug ? 1 : 0;
        this.director.reset();
      }
      if (this.art) {
        this.scene.remove(this.art.group);
        const sharedGeometry = [
            this.materials.box,
            this.materials.rounded,
            this.materials.cylinder,
            this.materials.cone,
            this.materials.sphere,
            this.materials.mushroom,
          ],
          sharedMaterial = Object.values(this.materials.items);
        this.art.group.traverse((o) => {
          if (o instanceof T.Mesh || o instanceof T.LineSegments) {
            if (o.userData.imported) {
              if (o instanceof T.InstancedMesh) o.dispose();
              return;
            }
            if (!sharedGeometry.includes(o.geometry)) o.geometry.dispose();
            const material = o.material as T.Material;
            if (!sharedMaterial.includes(material as T.MeshStandardMaterial)) material.dispose();
            if (o instanceof T.InstancedMesh) o.dispose();
          } else if (o instanceof T.Sprite) o.material.dispose();
        });
      }
      this.materials.items.stone.roughness = w.floor.biome === 1 ? 0.78 : 0.94;
      this.art = buildDungeon(w.floor, this.materials, this.assets);
      this.scene.add(this.art.group);
      this.floor = w.floor;
      this.travel = 1;
      this.travelFrom = undefined;
    }
    if (changedFloor || this.appliedQuality !== w.save.settings.detail) {
      this.appliedQuality = w.save.settings.detail;
      const high = w.save.settings.detail === 'high';
      this.webgl.setPixelRatio(
        Math.min(devicePixelRatio, high ? 1.5 : w.save.settings.detail === 'medium' ? 1 : 0.8),
      );
      const shadowSize = high ? 2048 : 1024;
      if (this.sun.shadow.mapSize.x !== shadowSize) {
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
        this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      }
      this.art?.group.traverse((obj) => {
        if (obj.userData.surfaceDecal) obj.visible = w.save.settings.quality;
        if (obj instanceof T.LOD && obj.levels.length === 3) {
          obj.levels[1].distance = high ? 32 : 16;
          obj.levels[2].distance = w.save.settings.quality ? 65 : 40;
        }
      });
    }
    if (this.revision !== w.roomRevision) {
      if (!changedFloor && this.revision >= 0 && this.previousPlayer.lengthSq() > 0) {
        this.travelFrom = this.previousPlayer.clone();
        this.travel = 0;
      }
      this.revision = w.roomRevision;
      for (const actor of this.actors.values()) {
        this.scene.remove(actor.root);
        actor.dispose();
      }
      this.actors.clear();
      for (const e of w.enemies) {
        const actor = new Actor(this.materials, e.def.id, false, this.assets);
        actor.root.scale.setScalar(e.def.scale);
        this.actors.set(e.id, actor);
        this.scene.add(actor.root);
      }
      this.webgl.shadowMap.needsUpdate = true;
    }
    const playerPosition = globalPosition(w.room, w.player.x, w.player.y);
    this.travel = Math.min(1, this.travel + dt * 1.7);
    if (this.travelFrom && this.travel < 1)
      playerPosition.lerp(this.travelFrom, 1 - T.MathUtils.smoothstep(this.travel, 0, 1));
    this.previousPlayer.copy(playerPosition);
    this.player.root.position.copy(playerPosition);
    this.materials.playerPosition.copy(playerPosition);
    this.materials.time.value = w.save.settings.reducedMotion ? 0 : w.visualTime;
    this.assets.walkingHeight.value = playerPosition.y;
    this.assets.fogColor.value.set(FOG_COLORS[w.floor.biome]);
    this.scene.background = this.backgrounds[w.floor.biome];
    (this.scene.fog as T.FogExp2).color.copy(this.assets.fogColor.value);
    this.mist.forEach((plane, i) => {
      plane.position.set(playerPosition.x, playerPosition.y - 7 - i * 5, playerPosition.z);
      plane.visible = w.save.settings.quality || i === 2;
    });
    this.director.update(dt, playerPosition);
    const duel = this.director.duel;
    const walking =
      (Math.hypot(w.movement.x, w.movement.y) > 0 || this.travel < 1) && w.mode === 'playing';
    if (walking && w.time - this.lastStep > 0.16) {
      this.lastStep = w.time;
      for (let i = 0; i < 3; i++)
        w.particles.push({
          x: w.player.x,
          y: w.player.y,
          vx: this.dustRandom.int(-20, 20),
          vy: this.dustRandom.int(-20, 20),
          life: 0.45,
          maxLife: 0.45,
          size: 1,
          color: w.floor.biome === 1 ? '#8ac4d1' : w.floor.biome === 3 ? '#bcd4df' : '#b9b09a',
          ground: true,
        });
    }
    const animationOptions = { ...w.lab, reducedMotion: w.save.settings.reducedMotion };
    this.player.animate(
      w.player,
      w.time,
      w.visualTime,
      walking,
      duel,
      w.weapon.id,
      animationOptions,
    );
    for (const e of w.enemies) {
      let actor = this.actors.get(e.id);
      if (!actor || actor.id !== e.def.id) {
        if (actor) {
          this.scene.remove(actor.root);
          actor.dispose();
        }
        actor = new Actor(this.materials, e.def.id, false, this.assets);
        actor.root.scale.setScalar(e.def.scale);
        this.actors.set(e.id, actor);
        this.scene.add(actor.root);
      }
      actor.root.position.copy(globalPosition(w.room, e.x, e.y));
      actor.root.visible = w.onlineMode !== 'duel';
      actor.setOutline(
        e === w.target && w.mode !== 'menu' && e.state !== 'dead'
          ? w.save.settings.strongOutline
            ? 1
            : 0.78
          : 0,
      );
      const animation = actor.animate(
        e,
        w.time,
        w.visualTime,
        e.state === 'idle' && w.mode === 'playing',
        duel,
        w.weapon.id,
        animationOptions,
      );
      if (e === w.target) {
        w.lab.animationName = animation.name;
        w.lab.normalized = animation.normalized;
        w.lab.hitWindow = animation.clip?.hitWindow?.map((n) => n.toFixed(2)).join('–') ?? 'none';
        w.lab.rootMotion = animation.pose.advance;
      }
    }
    const visiblePilgrims = new Set(w.remotePlayers.map((p) => p.id));
    for (const [id, entry] of this.pilgrims) {
      if (visiblePilgrims.has(id)) continue;
      this.scene.remove(entry.actor.root, entry.ring);
      entry.actor.dispose();
      entry.ring.geometry.dispose();
      entry.ring.material.dispose();
      this.pilgrims.delete(id);
    }
    for (const remote of w.remotePlayers) {
      let entry = this.pilgrims.get(remote.id);
      if (entry && entry.weapon !== remote.weapon) {
        this.scene.remove(entry.actor.root);
        entry.actor.dispose();
        entry.actor = new Actor(this.materials, `player-${remote.weapon}`, true, this.assets);
        entry.weapon = remote.weapon;
        this.scene.add(entry.actor.root);
      }
      if (!entry) {
        const actor = new Actor(this.materials, `player-${remote.weapon}`, true, this.assets);
        const ring = new T.Mesh(
          new T.RingGeometry(0.35, 0.39, 40),
          new T.MeshBasicMaterial({
            color: remote.color,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        entry = { actor, ring, weapon: remote.weapon };
        this.pilgrims.set(remote.id, entry);
        this.scene.add(actor.root, ring);
      }
      entry.actor.root.position.copy(globalPosition(w.room, remote.player.x, remote.player.y));
      entry.actor.root.visible = remote.connected;
      entry.ring.position.copy(entry.actor.root.position);
      entry.ring.position.y += 0.05;
      entry.ring.material.opacity = remote.connected ? (remote.player.hp > 0 ? 0.55 : 0.18) : 0.1;
      entry.actor.animate(
        remote.player,
        w.time,
        w.visualTime,
        remote.player.state === 'idle',
        duel,
        remote.weapon,
        animationOptions,
      );
    }
    this.sun.position.copy(playerPosition).add(new T.Vector3(15, 30, 10));
    this.sun.target.position.copy(playerPosition);
    this.rim.position.copy(playerPosition).add(new T.Vector3(-1, 2, -2));
    const torches = [...(this.art?.torches ?? [])].sort(
      (a, b) =>
        a.position.distanceToSquared(playerPosition) - b.position.distanceToSquared(playerPosition),
    );
    this.lights.forEach((light, i) => {
      const torch = torches[i];
      light.visible = Boolean(torch) && (w.save.settings.quality || i < 2);
      if (!torch) return;
      light.position.copy(torch.position);
      light.color.copy(torch.color);
      light.intensity =
        (w.room.modifier === 'Darkness' ? lighting.power * 0.65 : lighting.power) *
        (1 + Math.sin(w.visualTime * 8 + torch.seed) * 0.075);
    });
    for (const torch of this.art?.torches ?? []) {
      const flicker =
        1 +
        Math.sin(w.visualTime * 10 + torch.seed) * 0.12 +
        Math.sin(w.visualTime * 17 + torch.seed) * 0.05;
      torch.flame.scale.y = 1.1 * flicker;
      torch.flame.rotation.y = w.visualTime * 1.6;
      torch.flame.rotation.z = Math.sin(w.visualTime * 8 + torch.seed) * 0.15;
      torch.halo.material.opacity = 0.11 * flicker;
    }
    for (const [i, banner] of (this.art?.banners ?? []).entries()) {
      const positions = banner.geometry.attributes.position;
      for (let k = 0; k < positions.count; k++) {
        const y = positions.getY(k);
        positions.setZ(
          k,
          Math.sin(w.visualTime * 1.8 + i + positions.getX(k) * 3) * (0.5 - y / 2.2) * 0.08,
        );
      }
      positions.needsUpdate = true;
    }
    for (const water of this.art?.waters ?? []) {
      if (water.userData.shaderWater) {
        const ripples = water.userData.ripples as { value: T.Vector4[] };
        ripples.value[0].set(
          playerPosition.x,
          playerPosition.z,
          (w.visualTime * 0.7) % 1,
          walking ? 0.8 : 0,
        );
        w.effects.slice(-7).forEach((effect, i) => {
          const p = globalPosition(w.room, effect.x, effect.y);
          ripples.value[i + 1].set(p.x, p.z, effect.maxLife - effect.life, 1);
        });
        for (let i = w.effects.slice(-7).length + 1; i < 8; i++) ripples.value[i].w = 0;
        continue;
      }
      const positions = water.geometry.attributes.position,
        base = water.userData.baseZ as Float32Array | undefined;
      for (let i = 0; i < positions.count; i++) {
        positions.setZ(
          i,
          (base?.[i] ?? 0) +
            Math.sin(positions.getX(i) * 2 + w.visualTime * 0.9) * 0.025 +
            Math.cos(positions.getY(i) * 3 + w.visualTime) * 0.018,
        );
      }
      positions.needsUpdate = true;
    }
    for (const gear of this.art?.mechanisms ?? []) gear.rotation.y = w.visualTime * 0.25;
    for (const [id, gate] of this.art?.gates ?? []) {
      const closed = id === w.roomId && w.combat;
      gate.position.y = T.MathUtils.damp(gate.position.y, closed ? 0 : 3, 7, dt);
      gate.visible = closed || gate.position.y < 2.95;
    }
    this.fogSprites.forEach((sprite, i) => {
      sprite.visible =
        w.save.settings.quality && (w.save.settings.detail === 'high' || i % 2 === 0);
      sprite.position.set(
        playerPosition.x + Math.sin(i * 8 + w.visualTime * 0.025) * 22,
        -5 + (i % 3) * 1.3,
        playerPosition.z + Math.cos(i * 11) * 22,
      );
    });
    const dustMat = this.dust.material as T.PointsMaterial;
    dustMat.color.set(['#bbc5bb', '#9cbfc4', '#b49fda', '#d9eaf2', '#f7aa60'][w.floor.biome]);
    dustMat.size = w.floor.biome === 3 ? 0.15 : 0.09;
    this.dust.visible = w.save.settings.quality;
    this.dust.geometry.setDrawRange(0, w.save.settings.detail === 'high' ? 180 : 90);
    for (let i = 0; i < 180; i++) {
      const speed = w.floor.biome === 4 ? -0.65 : w.floor.biome === 3 ? 0.6 : 0.05;
      this.dustPositions.set(
        [
          playerPosition.x + Math.sin(i * 17.2) * 20 + Math.sin(w.visualTime * 0.15 + i) * 0.7,
          (((i * 0.731 - w.visualTime * speed) % 8) + 8) % 8,
          playerPosition.z + Math.cos(i * 9.7) * 20,
        ],
        i * 3,
      );
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
    this.effects.update(this.director.camera, duel);
    this.arsenal.update(this.director.camera);
    this.hud.update(duel);
    this.webgl.shadowMap.enabled = w.save.settings.quality;
    this.webgl.info.reset();
    if (w.save.settings.quality) this.composer.render(dt);
    else this.webgl.render(this.scene, this.director.camera);
    this.frames++;
    if (performance.now() - this.fpsAt > 1000) {
      w.presentation.fps = Math.round((this.frames * 1000) / (performance.now() - this.fpsAt));
      this.frames = 0;
      this.fpsAt = performance.now();
    }
    w.presentation.mode = this.director.mode;
    w.presentation.duel = duel;
    w.presentation.drawCalls = this.webgl.info.render.calls;
    w.presentation.triangles = this.webgl.info.render.triangles;
    this.fade = Math.max(0, this.fade - dt * 1.6);
    this.webgl.domElement.style.visibility = 'visible';
    this.veil.style.opacity = String(this.fade);
  }
  focusByPointer(dx: number, dy: number): void {
    const w = this.world,
      target = w.target;
    if (!target) return;
    const points = w.alive.map((e) => {
      const p = globalPosition(w.room, e.x, e.y);
      p.y += 1;
      p.project(this.director.camera);
      return { id: e.id, x: p.x * this.director.camera.aspect, y: -p.y };
    });
    w.focusEnemy(directionalFocus(points, target.id, dx, dy) ?? target.id);
  }
  destroy(): void {
    this.observer.disconnect();
    this.composer.dispose();
    this.bloom.dispose();
    this.output.dispose();
    this.effects.dispose();
    this.arsenal.dispose();
    this.player.dispose();
    for (const actor of this.actors.values()) actor.dispose();
    for (const entry of this.pilgrims.values()) {
      entry.actor.dispose();
      entry.ring.geometry.dispose();
      entry.ring.material.dispose();
    }
    this.pilgrims.clear();
    this.webgl.dispose();
    this.materials.dispose();
    this.assets.dispose();
    this.environment.dispose();
    this.backgrounds.forEach((texture) => texture.dispose());
    this.mist.forEach((mesh) => {
      mesh.geometry.dispose();
      (mesh.material as T.Material).dispose();
    });
    this.hud.root.remove();
    this.veil.remove();
    this.loadingNotice.remove();
    this.canvas.remove();
  }
}
