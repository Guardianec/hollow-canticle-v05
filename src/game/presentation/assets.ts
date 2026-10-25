import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { heightFog } from './atmosphere';
import { Random } from '../random';

export interface AssetRecord {
  pack: string;
  kind: 'environment' | 'character';
  biome: number;
  lods: { node: string; triangles: number }[];
}
export interface AssetManifest {
  assets: Record<string, AssetRecord>;
  packs: Record<string, { file: string; bytes: number; materials?: string[] }>;
  materials: Record<
    string,
    {
      baseColor: string;
      normal: string;
      roughness: string;
      ao: string;
      metalness: number;
      resolution: number;
      low?: { baseColor: string; normal: string; roughness: string; ao: string };
    }
  >;
}
export function packForBiome(biome: number) {
  return ['ruins', 'shrine', 'fungal', 'frozen', 'foundry'][biome];
}
export function assetVariant(seed: string, variants: readonly string[]) {
  return new Random(seed).pick([...variants]);
}
export function characterAsset(id: string) {
  const names: Record<string, string> = {
    player: 'oathkeeper',
    'player-sword': 'oathkeeper',
    'player-twins': 'moth',
    'player-spear': 'lancer',
    'player-great': 'bellbearer',
    'player-shinobi': 'shinobi',
    shield: 'warden',
    warden: 'oathkeeper',
    boss: 'saint',
  };
  return (
    names[id] ??
    (['warden', 'duelist', 'archer', 'assassin', 'monk', 'hexer', 'brute', 'beast'].includes(id)
      ? id
      : id === 'spear'
        ? 'lancer'
        : undefined)
  );
}

/** One loader and one resource owner per renderer. Clones never own shared GPU data. */
export class AssetManager {
  manifest?: AssetManifest;
  readonly missing = new Set<string>();
  readonly templates = new Map<string, T.Object3D>();
  readonly materials = new Map<string, T.MeshStandardMaterial>();
  readonly walkingHeight = { value: 0 };
  readonly fogColor = { value: new T.Color('#172a3b') };
  readonly mode: 'imported' | 'fallback';
  revision = 0;
  private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  private pending = new Map<string, Promise<void>>();
  private settled = new Set<string>();
  private requestedMaterials = new Set<string>();
  private materialLoading = Promise.resolve();
  private manifestLoading?: Promise<AssetManifest>;
  private textures = new Map<string, T.Texture>();
  private disposed = false;
  private textureHigh = true;
  private textureRequest = 0;
  private base = import.meta.env.BASE_URL + 'assets/v05/';
  get highDetail() {
    return this.textureHigh;
  }
  constructor(
    mode: 'imported' | 'fallback' = new URLSearchParams(location.search).get('visual') ===
    'fallback'
      ? 'fallback'
      : 'imported',
    high = true,
    private occlusionTarget?: T.Vector3,
  ) {
    this.mode = mode;
    this.textureHigh = high;
  }
  isBiomeSettled(biome: number): boolean {
    return this.mode === 'fallback' || this.settled.has(packForBiome(biome));
  }
  async preloadBiome(biome: number): Promise<void> {
    const pack = packForBiome(biome);
    if (this.mode === 'fallback' || !pack || this.disposed) return;
    if (!this.pending.has(pack))
      this.pending.set(
        pack,
        this.preloadCharacters()
          .then(() => {
            if (!this.manifest) {
              this.missing.add(pack);
              return;
            }
            return this.load(pack);
          })
          .finally(() => this.settled.add(pack)),
      );
    return this.pending.get(pack);
  }
  async preloadCharacters(): Promise<void> {
    if (this.mode === 'fallback' || this.disposed) return;
    if (!this.pending.has('pilgrims')) this.pending.set('pilgrims', this.load('pilgrims'));
    return this.pending.get('pilgrims');
  }
  private async load(pack: string) {
    try {
      if (!this.manifest) {
        this.manifestLoading ??= fetch(this.base + 'manifest.json').then(async (response) => {
          if (!response.ok) throw new Error(`manifest: HTTP ${response.status}`);
          return (await response.json()) as AssetManifest;
        });
        this.manifest = await this.manifestLoading;
      }
      for (const name of [pack])
        for (const material of this.manifest.packs[name].materials ??
          Object.keys(this.manifest.materials))
          this.requestedMaterials.add(material);
      await this.prepareMaterials();
      for (const name of [pack]) {
        if (name === 'pilgrims' && this.has('oathkeeper')) continue;
        const gltf = await this.loader.loadAsync(this.base + this.manifest!.packs[name].file);
        if (this.disposed) {
          this.release(gltf.scene);
          return;
        }
        gltf.scene.traverse((obj) => {
          if (!(obj instanceof T.Mesh)) return;
          const old = Array.isArray(obj.material) ? obj.material : [obj.material];
          const mapped = old.map((mat) => {
            const shared = this.materials.get(mat.name);
            if (!shared) throw new Error(`Unknown material ${mat.name}`);
            mat.dispose();
            return shared;
          });
          obj.material = Array.isArray(obj.material) ? mapped : mapped[0];
          obj.castShadow = obj.receiveShadow = true;
        });
        for (const [id, asset] of Object.entries(this.manifest!.assets)) {
          if (asset.pack !== name) continue;
          for (const lod of asset.lods) {
            const node = gltf.scene.getObjectByName(lod.node);
            if (!node) throw new Error(`Missing GLB node ${lod.node}`);
            this.templates.set(lod.node, node);
          }
          this.missing.delete(id);
        }
      }
      this.revision++;
    } catch (error) {
      this.missing.add(pack);
      console.warn(
        '[Hollow Canticle] Imported asset pack unavailable; procedural fallback active.',
        error,
      );
    }
  }
  async setTextureQuality(high: boolean) {
    if (this.textureHigh === high) return;
    this.textureHigh = high;
    if (this.manifest) await this.prepareMaterials();
  }
  private prepareMaterials() {
    const pending = this.materialLoading.then(() => this.loadMaterials());
    this.materialLoading = pending.catch(() => {});
    return pending;
  }
  private async loadMaterials() {
    const request = ++this.textureRequest;
    const loader = new T.TextureLoader();
    const texture = async (file: string, srgb = false) => {
      let t = this.textures.get(file);
      if (!t) {
        t = await loader.loadAsync(this.base + file);
        if (this.disposed) {
          t.dispose();
          throw new Error('Asset manager disposed during texture load');
        }
        t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
        t.flipY = false;
        t.wrapS = t.wrapT = T.RepeatWrapping;
        t.anisotropy = 4;
        this.textures.set(file, t);
      }
      return t;
    };
    await Promise.all(
      Object.entries(this.manifest!.materials)
        .filter(([id]) => this.requestedMaterials.has(id))
        .map(async ([id, family]) => {
          const maps = !this.textureHigh && family.low ? family.low : family;
          const [map, normalMap, roughnessMap, aoMap] = await Promise.all([
            texture(maps.baseColor, true),
            texture(maps.normal),
            texture(maps.roughness),
            texture(maps.ao),
          ]);
          if (this.disposed || request !== this.textureRequest) return;
          const existing = this.materials.get(id);
          if (existing) {
            Object.assign(existing, { map, normalMap, roughnessMap, aoMap });
            existing.needsUpdate = true;
            return;
          }
          const mat = new T.MeshStandardMaterial({
            name: id,
            map,
            normalMap,
            roughnessMap,
            aoMap,
            metalness: family.metalness,
            roughness: 1,
            vertexColors: true,
            envMapIntensity: family.metalness > 0.5 ? 2.4 : 1,
            side: id.endsWith('cloth') || id === 'pilgrim_linen' ? T.DoubleSide : T.FrontSide,
          });
          if (id.includes('stone')) mat.color.set('#858e91');
          if (id === 'heavy_cloth') mat.color.set('#2b3441');
          if (id === 'worn_leather') mat.color.set('#837568');
          if (id === 'fungal_skin') {
            mat.emissive.set('#8d46cc');
            mat.emissiveIntensity = 0.7;
            mat.onBeforeCompile = (shader) => {
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <emissivemap_fragment>',
                `#include <emissivemap_fragment>
              vec2 cell=floor(vMapUv*90.); vec2 pore=fract(vMapUv*90.)-.5;
              float seed=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
              float speck=(1.-smoothstep(.045,.16,length(pore)))*step(.64,seed);
              totalEmissiveRadiance*=.06+speck;`,
              );
            };
          }
          mat.normalScale.setScalar(id.includes('stone') ? 0.55 : 0.35);
          heightFog(
            mat,
            this.walkingHeight,
            this.fogColor,
            id.includes('stone') ? this.occlusionTarget : undefined,
          );
          this.materials.set(id, mat);
        }),
    );
    if (request === this.textureRequest && !this.disposed) {
      const used = new Set(
        [...this.materials.values()].flatMap((mat) => [
          mat.map,
          mat.normalMap,
          mat.roughnessMap,
          mat.aoMap,
        ]),
      );
      for (const [file, texture] of this.textures)
        if (!used.has(texture)) {
          texture.dispose();
          this.textures.delete(file);
        }
    }
  }
  has(id: string) {
    return this.templates.has(id + '_LOD0');
  }
  template(id: string, level = 0) {
    return this.templates.get(`${id}_LOD${level}`);
  }
  instanceBatches(id: string, level: number, matrices: T.Matrix4[]) {
    const root = this.template(id, level);
    if (!root) return [];
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    const batches: T.InstancedMesh[] = [];
    root.traverse((obj) => {
      if (!(obj instanceof T.Mesh)) return;
      const local = root.matrix.clone().multiply(inverse).multiply(obj.matrixWorld);
      const batch = new T.InstancedMesh(obj.geometry, obj.material, matrices.length);
      matrices.forEach((matrix, i) => {
        batch.setMatrixAt(i, matrix.clone().multiply(local));
        if (id.includes('_floor_')) {
          const rng = new Random(`stone:${matrix.elements[12]}:${matrix.elements[14]}`);
          batch.setColorAt(
            i,
            new T.Color().setHSL(
              0.08 + rng.next() * 0.06,
              0.04 + rng.next() * 0.08,
              0.76 + rng.next() * 0.2,
            ),
          );
        }
      });
      batch.castShadow = !id.endsWith('_deep_support');
      batch.receiveShadow = true;
      batch.userData.imported = true;
      batches.push(batch);
    });
    return batches;
  }
  instantiate(id: string, level = 0): T.Object3D | undefined {
    const template = this.template(id, level);
    if (!template) {
      this.missing.add(id);
      return;
    }
    return clone(template);
  }
  private release(root: T.Object3D) {
    root.traverse((obj) => {
      if (!(obj instanceof T.Mesh)) return;
      obj.geometry.dispose();
      if (obj instanceof T.SkinnedMesh) obj.skeleton.dispose();
    });
  }
  dispose() {
    this.disposed = true;
    for (const root of this.templates.values()) this.release(root);
    for (const mat of this.materials.values()) mat.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.templates.clear();
    this.materials.clear();
    this.textures.clear();
  }
}
