import * as T from 'three';
import { Actor } from './actors';
import { Materials } from './materials';
import { CHARACTERS } from '../characters';
import type { World } from '../world';
import { AssetManager } from './assets';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class CharacterGallery {
  private webgl = new T.WebGLRenderer({ antialias: true, alpha: true });
  private scene = new T.Scene();
  private camera = new T.OrthographicCamera(-4.2, 4.2, 1.4, -1.4, 0.1, 50);
  private materials = new Materials();
  private assets = new AssetManager();
  private environment: T.WebGLRenderTarget;
  private actors: Actor[] = [];
  private frame = 0;
  private observer: ResizeObserver;
  private started = performance.now();
  constructor(
    private host: HTMLElement,
    private world: World,
  ) {
    host.append(this.webgl.domElement);
    this.webgl.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.webgl.toneMapping = T.ACESFilmicToneMapping;
    this.webgl.toneMappingExposure = 1.6;
    const pmrem = new T.PMREMGenerator(this.webgl),
      room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.45;
    room.dispose();
    pmrem.dispose();
    void this.assets.preloadCharacters();
    this.scene.add(new T.HemisphereLight('#dae7f0', '#3d3021', 2.3));
    const key = new T.DirectionalLight('#f9ddaa', 4);
    key.position.set(2, 4, 4);
    this.scene.add(key);
    const rim = new T.DirectionalLight('#a9d5ed', 3);
    rim.position.set(-3, 2, -2);
    this.scene.add(rim);
    CHARACTERS.forEach((c) => {
      const actor = new Actor(this.materials, `player-${c.id}`, true, this.assets);
      actor.setWeapon(c.id);
      this.actors.push(actor);
      this.scene.add(actor.root);
    });
    this.camera.position.set(0, 2.3, 10.4);
    this.camera.lookAt(0, 1.1, 0);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.draw();
  }
  private resize(): void {
    const { width, height } = this.host.getBoundingClientRect();
    this.webgl.setSize(width, height);
    const half = Math.max(4.2, (width / Math.max(1, height)) * 1.3);
    this.camera.left = -half;
    this.camera.right = half;
    this.camera.updateProjectionMatrix();
  }
  private draw = (): void => {
    const time = this.world.save.settings.reducedMotion
      ? 0
      : (performance.now() - this.started) / 1000;
    this.actors.forEach((actor, i) => {
      const selected = this.world.selection === CHARACTERS[i].id;
      actor.root.position.set(
        (i - 1.5) * (this.camera.right / 2),
        selected ? 0.08 : 0,
        selected ? 0.3 : -0.25,
      );
      actor.setOutline(selected ? 1 : 0.12);
      actor.setEmphasis(selected);
      actor.root.scale.setScalar(selected ? 1.05 : 0.94);
      actor.animate(
        {
          ...this.world.player,
          state: 'idle',
          stateAt: 0,
          facing: Math.PI / 2 - (i === 2 ? 0.8 : 0.12),
        },
        time,
        time,
        false,
        1,
        CHARACTERS[i].id,
      );
    });
    this.webgl.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.draw);
  };
  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.actors.forEach((a) => a.dispose());
    this.materials.dispose();
    this.assets.dispose();
    this.environment.dispose();
    this.webgl.dispose();
    this.webgl.domElement.remove();
  }
}
