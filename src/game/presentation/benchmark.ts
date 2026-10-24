import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AssetManager } from './assets';
import { Actor } from './actors';
import { Materials, Batches } from './materials';
import { FOG_COLORS, heightFog, chasmMist, voidBackground } from './atmosphere';
import { World, type Effect } from '../world';
import { EXECUTIONS } from '../executions';
import { createWeaponEffect, updateWeaponEffect } from './weapon-effects';
import { defaultSave } from '../save';
import { BIOME_LIGHTING } from './lighting';
import { waterSurface } from './water';

export async function startBenchmark() {
  const params = new URLSearchParams(location.search);
  const app = document.querySelector<HTMLElement>('#app')!;
  app.innerHTML = `<main class="art-benchmark"><canvas aria-label="Ruins visual benchmark"></canvas>
    <header><a href="${import.meta.env.BASE_URL}">HOLLOW CANTICLE</a><span>RUINS · ART BENCHMARK</span></header>
    <aside><label>View <select id="art-view"><option value="exploration">Exploration</option><option value="duel">Close duel</option><option value="void">Bridge & void</option><option value="materials">Surface study</option><option value="comparison">v0.4 / Blender</option></select></label>
    <label>Quality <select id="art-quality"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
    <label>Region <select id="art-biome">${BIOME_LIGHTING.map((p, i) => `<option value="${i}">${p.name}</option>`).join('')}</select></label>
    <label>Pilgrim <select id="art-player"><option value="sword">Oathkeeper</option><option value="twins">Moth</option><option value="spear">Lancer</option><option value="great">Bellbearer</option></select></label>
    <label>Opponent <select id="art-enemy">${['warden', 'shield', 'duelist', 'spear', 'assassin', 'archer', 'monk', 'hexer', 'brute', 'beast', 'boss'].map((id) => `<option value="${id}">${id === 'boss' ? 'The Saint' : id}</option>`).join('')}</select></label>
    <label>Pose <select id="art-pose"><option value="live">Idle</option><option value="slash">Slash</option><option value="thrust">Thrust</option><option value="smash">Overhead</option><option value="parry">Parry</option><option value="dodge">Dodge</option><option value="finisher">Finisher</option></select></label>
    <label>Execution <select id="art-execution"><option value="0">I</option><option value="1">II</option><option value="2">III</option></select></label>
    <label>Weapon effect <select id="art-effect"><option value="none">None</option><option value="slash">Strike</option><option value="ring">Deflect</option><option value="perfect">Perfect deflect</option></select></label>
    <label>Effect time <input id="art-effect-time" type="range" min="0" max="1" value="0.12" step="0.01"></label>
    <label>Pose time <input id="art-time" type="range" min="0" max="1" value="0.55" step="0.01"></label>
    <label><input id="art-phase" type="checkbox"> Saint phase II</label>
    <label><input id="art-motion" type="checkbox"> Animate atmosphere</label>
    <button id="art-capture">Save screenshot</button><output id="art-status" aria-live="polite">Loading Blender pack…</output></aside>
    <footer><span>THE FORGOTTEN RUINS</span><span>Drag to orbit · Scroll to inspect</span><output id="art-metrics"></output></footer></main>`;
  const style = document.createElement('style');
  style.textContent = `.art-benchmark{position:fixed;inset:0;background:#172a3b;color:#ddd8c7}.art-benchmark canvas{width:100%;height:100%;display:block}.art-benchmark header{position:absolute;left:30px;top:24px;display:flex;gap:30px;align-items:center;font-size:11px;letter-spacing:.19em}.art-benchmark header a{font-family:'Cormorant Garamond',serif;font-size:23px;color:#e1d8bb;text-decoration:none}.art-benchmark header span{color:#a2b5bd}.art-benchmark aside{position:absolute;right:24px;top:24px;width:180px;max-height:calc(100vh - 100px);overflow:auto;display:grid;gap:12px;padding:17px;background:#0c141bda;border:1px solid #b1a27b40;font-size:11px}.art-benchmark label{display:grid;gap:5px}.art-benchmark select,.art-benchmark button{background:#18252c;color:#ded8c9;border:1px solid #89958c55;padding:7px;font:inherit}.art-benchmark input[type=checkbox]{width:auto}.art-benchmark footer{position:absolute;bottom:20px;left:30px;right:30px;display:flex;justify-content:space-between;gap:20px;font-size:10px;letter-spacing:.1em;color:#a7b5ba}.art-benchmark output{font-size:10px;color:#a9beb9}@media(max-width:600px){.art-benchmark aside{width:132px;right:10px;top:64px;gap:7px;padding:10px}.art-benchmark header{left:15px;gap:12px}.art-benchmark header span{font-size:8px}.art-benchmark footer{left:15px}.art-benchmark footer>span:nth-child(2){display:none}}`;
  document.head.append(style);
  const canvas = app.querySelector('canvas')!;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  const scene = new T.Scene();
  scene.background = voidBackground();
  scene.fog = new T.FogExp2(FOG_COLORS[0], 0.018);
  const camera = new T.PerspectiveCamera(40, 1, 0.1, 250);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI * 0.72;
  const pmrem = new T.PMREMGenerator(renderer);
  const environment = new RoomEnvironment();
  const env = pmrem.fromScene(environment, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.3;
  environment.dispose();
  pmrem.dispose();
  const ambient = new T.HemisphereLight();
  scene.add(ambient);
  const moon = new T.DirectionalLight('#acc8e2', 1.4);
  moon.position.set(-8, 18, 3);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, far: 80 });
  moon.shadow.normalBias = 0.04;
  scene.add(moon);
  const rim = new T.PointLight('#9ebce0', 6, 8, 1.4);
  rim.position.set(0, 3, 2.5);
  scene.add(rim);
  const inspection = new T.DirectionalLight('#e5edf2', 2);
  inspection.position.set(3, 6, 8);
  scene.add(inspection);
  const assets = new AssetManager(
    'imported',
    !['low', 'medium'].includes(params.get('quality') ?? ''),
  );
  await assets.preloadBiome(0);
  const status = app.querySelector<HTMLOutputElement>('#art-status')!;
  if (!assets.has('ruins_floor_a')) {
    status.value = 'Pack failed. Open the game for procedural fallback.';
    return;
  }
  const materials = new Materials();
  for (const material of Object.values(materials.items))
    heightFog(material, assets.walkingHeight, assets.fogColor);
  const world = new World(defaultSave());
  const stage = new T.Group(),
    compare = new T.Group(),
    study = new T.Group();
  scene.add(stage, compare, study);
  const dummy = new T.Object3D();
  const placements = new Map<string, T.Matrix4[]>();
  const distantPlacements = new Map<string, T.Matrix4[]>();
  const place = (
    id: string,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    rotation = 0,
  ) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(0, rotation, 0);
    dummy.updateMatrix();
    const target = z < -10 ? distantPlacements : placements;
    const list = target.get(id) ?? [];
    list.push(dummy.matrix.clone());
    target.set(id, list);
  };
  // A continuous floor and exposed bridge, with silhouettes concentrated at the rear.
  for (let x = -6; x <= 6; x++)
    for (let z = -4; z <= 4; z++)
      place('ruins_floor_' + ['a', 'b', 'c'][Math.abs(x * 7 + z * 11) % 3], x, 0, z);
  for (let x = -1; x <= 1; x++) for (let z = 5; z <= 17; z++) place('ruins_floor_a', x, 0, z);
  for (let x = -3; x <= 3; x++) for (let z = 18; z <= 22; z++) place('ruins_floor_b', x, 0, z);
  place('ruins_altar', 0, 0, 20);
  // A lower cloister gives the chasm a middle distance between route and skyline.
  for (let i = -4; i <= 4; i++) {
    const x = i * 4;
    place('ruins_bridge', x, -5, -19, 1, 1, 1.34, Math.PI / 2);
    place('ruins_arch_a', x, -5, -19, 1.32, 1.32, 1.1);
    place('ruins_deep_support', x - 1.9, -5, -19, 1.1, 1, 1.1);
    if (i % 2 === 0) place('ruins_column_a', x - 1.9, -5, -19, 0.8, 2.4, 0.8);
  }
  for (const side of [-1, 1]) {
    for (const z of [-4, 3, 9, 15, 19])
      place('ruins_deep_support', side * (z < 5 ? 5.5 : 1), 0, z, 1, 1, 1);
    place('ruins_column_a', side * 5.5, 0, -3.7, 1, 1.45, 1);
    place('ruins_column_broken', side * 6, 0, 3.5);
    place('ruins_wall_broken', side * 4.5, 0, -4.2, 1, 1.15, 1);
    place('ruins_statue', side * 4.6, 0, -2.9, 0.85, 0.85, 0.85, side * 0.3);
    for (const z of [6, 9, 12, 15]) place('ruins_railing', side * 1.42, 0, z, 1, 1, 1, Math.PI / 2);
    for (let i = 0; i < 7; i++) {
      const x = side * (12 + i * 5),
        z = -13 - i * 6;
      place('ruins_column_a', x, -16, z, 1.5, 6, 1.5);
      place('ruins_deep_support', x, -16, z, 1.5, 1, 1.5);
      if (i % 2 === 0) place('ruins_arch_a', x, -7, z, 2.8, 3, 2);
    }
  }
  place('ruins_doorway', 0, 0, -4.5, 1.1, 1.1, 1.1);
  place('ruins_arch_broken', -10, -4, -4, 1.5, 1.6, 1.5, Math.PI / 2);
  place('ruins_stairs', -3, 0, -5, 1, 1, 1, Math.PI);
  place('ruins_tomb', 5.3, 0, 0.5, 0.8, 0.8, 0.8);
  for (let i = 0; i < 13; i++)
    place('ruins_rubble', Math.sin(i * 43) * 5.3, 0, Math.cos(i * 19) * 3.8, 0.6, 0.6, 0.6, i);
  const flames: T.Mesh[] = [];
  const lights: T.PointLight[] = [];
  const halos: T.Sprite[] = [];
  for (const [x, z] of [
    [-4, -2],
    [4, -2],
    [-5, 3],
    [5, 3],
    [-1, 9],
    [1, 15],
    [0, 20],
  ]) {
    place('ruins_brazier', x, 0, z);
    const flame = new T.Mesh(
      new T.ConeGeometry(0.12, 0.44, 8),
      new T.MeshBasicMaterial({ color: '#ffb46c' }),
    );
    flame.position.set(x, 1.23, z);
    stage.add(flame);
    flames.push(flame);
    const light = new T.PointLight('#ffad51', 35, 8, 1.6);
    light.position.copy(flame.position);
    scene.add(light);
    lights.push(light);
    const halo = new T.Sprite(
      new T.SpriteMaterial({
        map: materials.glow,
        color: '#ffa543',
        opacity: 0.15,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    halo.position.copy(flame.position);
    halo.scale.set(2.2, 2.2, 1);
    stage.add(halo);
    halos.push(halo);
  }
  const lod = new T.LOD();
  const skyline = new T.Group(),
    biomeProps = new T.Group();
  stage.add(lod, skyline, biomeProps);
  const region = app.querySelector<HTMLSelectElement>('#art-biome')!;
  let biomeRequest = 0;
  async function updateBiome() {
    const request = ++biomeRequest,
      biome = Number(region.value);
    status.value = `Loading ${BIOME_LIGHTING[biome].name}…`;
    await assets.preloadBiome(biome);
    if (request !== biomeRequest) return;
    const prefix = ['ruins', 'shrine', 'fungal', 'frozen', 'foundry'][biome];
    if (!assets.has(prefix + '_floor_a')) {
      status.value = 'Region pack unavailable';
      return;
    }
    for (const group of [lod, skyline]) {
      group.traverse((obj) => {
        if (obj instanceof T.InstancedMesh) obj.dispose();
      });
      group.clear();
    }
    lod.levels.length = 0;
    biomeProps.traverse((obj) => {
      if (obj instanceof T.Mesh && obj.userData.shaderWater) {
        obj.geometry.dispose();
        (obj.material as T.Material).dispose();
      }
    });
    biomeProps.clear();
    const alias = (id: string) => id.replace(/^ruins_/, prefix + '_');
    for (const [id, matrices] of distantPlacements)
      skyline.add(...assets.instanceBatches(alias(id), 2, matrices));
    for (let level = 0; level < 3; level++) {
      const group = new T.Group();
      for (const [id, matrices] of placements)
        group.add(...assets.instanceBatches(alias(id), level, matrices));
      lod.addLevel(group, level === 0 ? 0 : level === 1 ? 34 : 65);
    }
    const props: Record<number, string[]> = {
      1: ['lantern'],
      2: ['growth', 'root_cluster'],
      3: ['snowbank', 'ice_shards'],
      4: ['furnace', 'gear', 'chain'],
    };
    (props[biome] ?? []).forEach((id, i) => {
      const prop = assets.instantiate(prefix + '_' + id);
      if (prop) {
        prop.position.set(-3 + i * 2.2, 0, -1.8);
        biomeProps.add(prop);
      }
    });
    if (biome === 1)
      biomeProps.add(
        waterSurface(
          new T.PlaneGeometry(4, 3).rotateX(-Math.PI / 2).translate(0, 0.035, 2),
          materials,
        ),
      );
    const profile = BIOME_LIGHTING[biome];
    ambient.color.set(profile.sky);
    ambient.groundColor.set(profile.ground);
    ambient.intensity = profile.ambient;
    moon.color.set(profile.moon);
    moon.intensity = profile.sun;
    rim.color.set(profile.rim);
    scene.environmentIntensity = profile.environment;
    renderer.toneMappingExposure = profile.exposure;
    (scene.background as T.Texture).dispose();
    scene.background = voidBackground(biome);
    scene.fog = new T.FogExp2(FOG_COLORS[biome], profile.fog);
    assets.fogColor.value.set(FOG_COLORS[biome]);
    lights.forEach((l) => {
      l.color.set(profile.torch);
      l.intensity = profile.power;
    });
    flames.forEach((f) =>
      (f.material as T.MeshBasicMaterial).color.set(profile.torch).multiplyScalar(1.65),
    );
    halos.forEach((h) => h.material.color.set(profile.torch));
    app.querySelector('header span')!.textContent = profile.name.toUpperCase() + ' · ART BENCHMARK';
    app.querySelector('footer span')!.textContent = profile.name.toUpperCase();
    status.value = `${Object.keys(assets.manifest!.assets).length} assets · Blender 4.5.15 · loaded`;
  }
  region.addEventListener('change', () => {
    void updateBiome()
      .then(() => {
        appliedQuality = '';
      })
      .catch((error) => {
        status.value = String(error);
      });
  });
  region.value = /^[0-4]$/.test(params.get('biome') ?? '') ? params.get('biome')! : '0';
  await updateBiome();
  let player = new Actor(materials, 'player-sword', true, assets),
    enemy = new Actor(materials, 'shield', false, assets);
  player.root.position.set(-1.1, 0, 1);
  enemy.root.position.set(1.1, 0, 0.1);
  stage.add(player.root, enemy.root);
  const pilgrim = app.querySelector<HTMLSelectElement>('#art-player')!;
  const opponent = app.querySelector<HTMLSelectElement>('#art-enemy')!;
  opponent.value = 'shield';
  pilgrim.addEventListener('change', () => {
    player.dispose();
    player.root.removeFromParent();
    player = new Actor(materials, 'player-' + pilgrim.value, true, assets);
    player.root.position.set(-1.1, 0, 1);
    stage.add(player.root);
  });
  opponent.addEventListener('change', () => {
    enemy.dispose();
    enemy.root.removeFromParent();
    enemy = new Actor(materials, opponent.value, false, assets);
    enemy.root.position.set(1.1, 0, 0.1);
    enemy.root.scale.setScalar(opponent.value === 'boss' ? 1.7 : 1);
    stage.add(enemy.root);
    if (opponent.value === 'boss') {
      camera.position.set(-6, 4, 9);
      controls.target.set(0, 1.8, 0.4);
      controls.update();
    }
  });
  const old = new Actor(materials, 'player-sword', true);
  old.root.position.set(-2, 0, 0);
  compare.add(old.root);
  const newer = new Actor(materials, 'player-sword', true, assets);
  newer.root.position.set(2, 0, 0);
  compare.add(newer.root);
  const oldBatch = new Batches(materials);
  for (const x of [-3.3, -0.7])
    for (let h = 0; h < 3; h += 0.48)
      oldBatch.add('rounded', 'stone', x, h + 0.2, -1.5, 0.6, 0.44, 0.6);
  for (let i = 0; i < 9; i++) {
    const a = (Math.PI * i) / 8;
    oldBatch.add(
      'rounded',
      'stone',
      -2 + Math.cos(a) * 1.3,
      2.8 + Math.sin(a) * 1.1,
      -1.5,
      0.5,
      0.6,
      0.6,
    );
  }
  oldBatch.build(compare);
  const newArch = assets.instantiate('ruins_arch_a')!;
  newArch.position.set(2, 0, -1.5);
  compare.add(newArch);
  for (const [i, name] of [
    'ancient_stone',
    'carved_stone',
    'moss_stone',
    'worn_iron',
    'aged_bronze',
    'heavy_cloth',
    'worn_leather',
  ].entries()) {
    const geometry = new T.SphereGeometry(0.65, 48, 32);
    geometry.setAttribute(
      'color',
      new T.Float32BufferAttribute(
        new Float32Array(geometry.attributes.position.count * 3).fill(1),
        3,
      ),
    );
    const ball = new T.Mesh(geometry, assets.materials.get(name));
    ball.position.set(((i % 3) - 1) * 1.5, 2.2 - Math.floor(i / 3) * 1.5, 0);
    study.add(ball);
  }
  const clock = { value: 0 };
  for (let i = 0; i < 3; i++) {
    const mist = new T.Mesh(new T.PlaneGeometry(180, 180), chasmMist(clock, assets.fogColor.value));
    mist.rotation.x = -Math.PI / 2;
    mist.position.y = -7 - i * 6;
    scene.add(mist);
  }
  const view = app.querySelector<HTMLSelectElement>('#art-view')!;
  const quality = app.querySelector<HTMLSelectElement>('#art-quality')!;
  const pose = app.querySelector<HTMLSelectElement>('#art-pose')!;
  const motion = app.querySelector<HTMLInputElement>('#art-motion')!;
  const poseTime = app.querySelector<HTMLInputElement>('#art-time')!;
  const views: Record<string, { position: T.Vector3; target: T.Vector3 }> = {
    exploration: { position: new T.Vector3(13, 13, 17), target: new T.Vector3(0, 1, 0) },
    duel: { position: new T.Vector3(3.8, 2.5, 6), target: new T.Vector3(0, 1.05, 0.6) },
    void: { position: new T.Vector3(17, 8, 27), target: new T.Vector3(0, -4, 9) },
    materials: { position: new T.Vector3(0, 1.4, 8), target: new T.Vector3(0, 0.5, 0) },
    comparison: { position: new T.Vector3(6, 4, 10), target: new T.Vector3(0, 1.5, -0.5) },
  };
  function updateView() {
    const v = views[view.value];
    camera.position.copy(v.position);
    controls.target.copy(v.target);
    controls.update();
    stage.visible = !['comparison', 'materials'].includes(view.value);
    compare.visible = view.value === 'comparison';
    study.visible = view.value === 'materials';
    inspection.visible = study.visible || compare.visible;
    lights.forEach((l) => (l.visible = stage.visible));
  }
  view.value =
    params.get('view') && views[params.get('view')!] ? params.get('view')! : 'exploration';
  quality.value = ['low', 'medium', 'high'].includes(params.get('quality') ?? '')
    ? params.get('quality')!
    : 'high';
  motion.checked = false;
  view.addEventListener('change', updateView);
  updateView();
  quality.addEventListener('change', () => {
    void assets.setTextureQuality(quality.value === 'high').catch((error) => {
      status.value = String(error);
    });
  });
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);
  app.querySelector('#art-capture')!.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `hollow-canticle-v05-${view.value}-${quality.value}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
  status.value = `${Object.keys(assets.manifest!.assets).length} assets · Blender ${'4.5.15'} · loaded`;
  let frame = 0,
    last = performance.now(),
    frames = 0,
    at = last;
  let appliedQuality = '';
  const effectChoice = app.querySelector<HTMLSelectElement>('#art-effect')!;
  const effectTime = app.querySelector<HTMLInputElement>('#art-effect-time')!;
  let effectKey = '',
    effectArt: T.Group | undefined,
    effect: Effect;
  const clearEffect = () => {
    effectArt?.removeFromParent();
    effectArt?.traverse((obj) => {
      if (obj instanceof T.Mesh || obj instanceof T.LineSegments) obj.geometry.dispose();
      if (obj instanceof T.Mesh || obj instanceof T.LineSegments || obj instanceof T.Sprite)
        (obj.material as T.Material).dispose();
    });
    effectArt = undefined;
  };
  const draw = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (motion.checked && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      clock.value += dt;
    materials.time.value = clock.value;
    if (appliedQuality !== quality.value) {
      appliedQuality = quality.value;
      renderer.setPixelRatio(
        quality.value === 'high'
          ? Math.min(devicePixelRatio, 1.5)
          : quality.value === 'medium'
            ? 1
            : 0.75,
      );
      renderer.shadowMap.enabled = quality.value !== 'low';
      lod.levels[1].distance = quality.value === 'high' ? 34 : quality.value === 'medium' ? 15 : 0;
      lod.levels[2].distance = quality.value === 'low' ? 20 : 65;
    }
    const options = {
      clip: ['parry', 'dodge'].includes(pose.value) ? 'live' : pose.value,
      clipTime: Number(poseTime.value),
      executionVariant: Number(app.querySelector<HTMLSelectElement>('#art-execution')!.value),
      freeze: true,
      reducedMotion: !motion.checked,
    };
    const entity = {
      ...world.player,
      state:
        pose.value === 'parry'
          ? ('parry' as const)
          : pose.value === 'dodge'
            ? ('dodge' as const)
            : ('idle' as const),
      stateAt: pose.value === 'dodge' ? clock.value - Number(poseTime.value) * 0.3 : 0,
    };
    player.animate(
      { ...entity, facing: -0.5 },
      clock.value,
      clock.value,
      false,
      view.value === 'duel' ? 1 : 0,
      pilgrim.value,
      options,
    );
    enemy.animate(
      {
        ...entity,
        facing: Math.PI - 0.5,
        phase:
          opponent.value === 'boss' && app.querySelector<HTMLInputElement>('#art-phase')!.checked
            ? 2
            : 1,
      },
      clock.value,
      clock.value,
      false,
      view.value === 'duel' ? 1 : 0,
      'sword',
      options,
    );
    old.animate(
      { ...entity, facing: Math.PI / 2 },
      clock.value,
      clock.value,
      false,
      1,
      'sword',
      options,
    );
    newer.animate(
      { ...entity, facing: Math.PI / 2 },
      clock.value,
      clock.value,
      false,
      1,
      'sword',
      options,
    );
    const key = `${effectChoice.value}:${pilgrim.value}:${pose.value}:${options.executionVariant}`;
    if (key !== effectKey) {
      effectKey = key;
      clearEffect();
      if (effectChoice.value !== 'none') {
        effect = {
          x: 0,
          y: 0,
          angle: -0.5,
          kind: effectChoice.value as Effect['kind'],
          life: 0.4,
          maxLife: 0.4,
          color: '#e2d3b0',
          scale: 1.2,
          weapon: pilgrim.value,
          attackKind:
            pose.value === 'finisher'
              ? EXECUTIONS[pilgrim.value][options.executionVariant].kind
              : pose.value === 'thrust' || pilgrim.value === 'spear'
                ? 'thrust'
                : pose.value === 'smash'
                  ? 'smash'
                  : 'slash',
          contact: effectChoice.value !== 'slash',
        };
        effectArt = createWeaponEffect(effect, materials.glow);
        effectArt.position.set(
          effect.kind === 'slash' ? -1.1 : 0,
          1.25,
          effect.kind === 'slash' ? 1 : 0.5,
        );
        stage.add(effectArt);
      }
    }
    if (effectArt)
      updateWeaponEffect(effectArt, effect, Number(effectTime.value), !motion.checked, true);
    flames.forEach((f, i) => (f.scale.y = 1 + Math.sin(clock.value * 9 + i) * 0.08));
    renderer.render(scene, camera);
    frames++;
    if (now - at > 1000) {
      app.querySelector<HTMLOutputElement>('#art-metrics')!.value =
        `${Math.round((frames * 1000) / (now - at))} FPS · ${renderer.info.render.calls} calls · ${renderer.info.render.triangles.toLocaleString()} triangles`;
      frames = 0;
      at = now;
    }
    frame = requestAnimationFrame(draw);
  };
  draw();
  window.addEventListener(
    'pagehide',
    () => {
      cancelAnimationFrame(frame);
      controls.dispose();
      clearEffect();
      player.dispose();
      enemy.dispose();
      old.dispose();
      newer.dispose();
      assets.dispose();
      materials.dispose();
      env.dispose();
      renderer.dispose();
      window.removeEventListener('resize', resize);
    },
    { once: true },
  );
}
