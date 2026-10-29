import * as T from 'three';
import type { World } from '../world';
import { AREA_KINDS, AREA_RULES, areaPhase } from '../areas';
import { globalPosition } from './architecture';
import { SCALE } from './materials';

/** Ground warnings are reserved, unbudgeted gameplay geometry on every preset. */
export class AreaArt {
  readonly root = new T.Group();
  private activated = new Set<number>();
  private dummy = new T.Object3D();
  private pool: {
    ground: T.Mesh<T.PlaneGeometry, T.ShaderMaterial>;
    volume: T.Mesh<T.CylinderGeometry, T.ShaderMaterial>;
    lob: T.Mesh<T.SphereGeometry, T.MeshBasicMaterial>;
    ice: T.InstancedMesh<T.ConeGeometry, T.MeshStandardMaterial>;
  }[] = [];
  constructor() {
    const plane = new T.PlaneGeometry(2, 2),
      cylinder = new T.CylinderGeometry(0.7, 1, 1, 24, 1, true),
      sphere = new T.SphereGeometry(0.09, 8, 6);
    const crystal = new T.ConeGeometry(0.18, 1, 5);
    const iceMaterial = new T.MeshStandardMaterial({
      color: '#a3d8f5',
      emissive: '#5084a5',
      emissiveIntensity: 0.18,
      roughness: 0.28,
      metalness: 0.15,
    });
    for (let i = 0; i < 5; i++) {
      const uniforms = {
        tint: { value: new T.Color() },
        clock: { value: 0 },
        active: { value: 0 },
        fade: { value: 1 },
        kind: { value: 0 },
        progress: { value: 0 },
      };
      const ground = new T.Mesh(
        plane,
        new T.ShaderMaterial({
          uniforms,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
          vertexShader:
            'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
          fragmentShader: `uniform vec3 tint;uniform float clock,active,fade,kind,progress;varying vec2 vUv;
          void main(){vec2 p=vUv*2.-1.;float d=length(p);if(d>1.)discard;
          float rim=(1.-smoothstep(0.,.025,abs(d-.87)));float spokes=step(.7,sin(atan(p.y,p.x)*14.+clock*1.5));
          float stroke=smoothstep(.90,.92,d)*(1.-smoothstep(.975,.995,d));
          float fill=(1.-smoothstep(.78,1.,d))*.22;
          float charge=step(d,progress)*.12;
          float wave=1.-smoothstep(.04,.12,abs(d-progress));
          float cracks=pow(max(0.,sin(p.x*21.+sin(p.y*16.))*sin(p.y*23.)),6.);
          float pattern=kind<.5?cracks:kind<1.5?wave:kind<2.5?(.5+.5*sin(d*20.-clock*2.)):kind<3.5?spokes:cracks*1.6;
          float a=max(stroke*.95,mix(rim*.95+fill+charge, rim*.95+fill+pattern*.55,active))*fade;
          vec3 c=mix(tint,vec3(.02,.035,.055),stroke);
          if(active>.5 && kind>3.5)c=mix(c,vec3(1.,.6,.04),cracks);
          if(active>.5 && kind>2.5&&kind<3.5)c=mix(c,vec3(.12,.35,.58),spokes*.7);
          gl_FragColor=vec4(c,a);}`,
        }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.renderOrder = 6;
      const volume = new T.Mesh(
        cylinder,
        new T.ShaderMaterial({
          uniforms,
          transparent: true,
          depthWrite: false,
          side: T.DoubleSide,
          toneMapped: false,
          vertexShader:
            'uniform float clock,kind;varying vec2 vUv;void main(){vUv=uv;vec3 p=position;if(kind>3.5)p.x+=sin(clock*4.+p.y*7.+p.z*5.)*.04;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}',
          fragmentShader: `uniform vec3 tint;uniform float clock,kind,fade;varying vec2 vUv;
          void main(){float n=sin(vUv.x*70.+sin(vUv.y*19.-clock*3.))*sin(vUv.y*27.+clock*2.);
          float a=(1.-smoothstep(.2,1.,vUv.y))*(.09+.12*max(0.,n))*fade;
          if(kind>2.5&&kind<3.5)a*=step(.3,sin(vUv.x*75.))*step(vUv.y,.3+.45*sin(vUv.x*45.));
          gl_FragColor=vec4(tint,a);}`,
        }),
      );
      const lob = new T.Mesh(
        sphere,
        new T.MeshBasicMaterial({ color: '#ffb65f', toneMapped: false }),
      );
      const ice = new T.InstancedMesh(crystal, iceMaterial, 12);
      ice.frustumCulled = false;
      this.pool.push({ ground, volume, lob, ice });
      this.root.add(ground, volume, lob, ice);
    }
  }
  update(w: World): void {
    const present = new Set(w.areas.active.map((a) => a.id));
    for (const id of this.activated) if (!present.has(id)) this.activated.delete(id);
    this.pool.forEach((slot, i) => {
      const a = w.areas.active[i];
      slot.ground.visible = slot.volume.visible = slot.lob.visible = Boolean(a);
      slot.ice.visible = false;
      if (!a) return;
      const phase = areaPhase(a, w.time),
        radius = a.radius * SCALE;
      if (phase === 'active' && !this.activated.has(a.id)) {
        this.activated.add(a.id);
        w.environmentImpact(a.x, a.y, 1.3);
        w.impact(a.x, a.y, AREA_RULES[a.kind].color, 20, 'ring', 1.5);
      }
      const pos = globalPosition(w.room, a.x, a.y, 0.08);
      slot.ground.position.copy(pos);
      slot.ground.scale.set(radius, radius, 1);
      const u = slot.ground.material.uniforms;
      u.tint.value.set(AREA_RULES[a.kind].color);
      u.clock.value = w.save.settings.reducedMotion ? 0 : w.visualTime;
      u.kind.value = AREA_KINDS.indexOf(a.kind);
      u.active.value = phase === 'telegraph' ? 0 : 1;
      u.fade.value = phase === 'fading' ? Math.max(0, 1 - (w.time - a.expireAt) / 0.65) : 1;
      u.progress.value =
        phase === 'telegraph'
          ? (w.time - a.createdAt) / (a.armAt - a.createdAt)
          : Math.min(1, (w.time - a.armAt) / (a.expireAt - a.armAt));
      slot.volume.visible =
        phase === 'active' && a.kind !== 'resonance' && w.save.settings.detail !== 'very-low';
      slot.volume.position.copy(pos);
      slot.volume.position.y += a.kind === 'spores' ? 0.65 : 0.25;
      slot.volume.scale.set(
        radius,
        a.kind === 'spores' ? 1.3 : a.kind === 'frost' ? 0.85 : 0.5,
        radius,
      );
      slot.ice.visible = a.kind === 'frost' && phase === 'active';
      if (slot.ice.visible) {
        slot.ice.count =
          w.save.settings.detail === 'very-low' ? 4 : w.save.settings.detail === 'low' ? 6 : 12;
        const growth = Math.min(1, (w.time - a.armAt) * 5);
        for (let k = 0; k < slot.ice.count; k++) {
          const angle = (k * Math.PI * 2) / slot.ice.count,
            height = (0.4 + (k % 3) * 0.23) * growth;
          this.dummy.position.set(
            pos.x + Math.cos(angle) * radius * 0.67,
            pos.y + height * 0.5,
            pos.z + Math.sin(angle) * radius * 0.67,
          );
          this.dummy.rotation.set(Math.cos(angle) * 0.2, angle, Math.sin(angle) * 0.2);
          this.dummy.scale.set(1, height, 1);
          this.dummy.updateMatrix();
          slot.ice.setMatrixAt(k, this.dummy.matrix);
        }
        slot.ice.instanceMatrix.needsUpdate = true;
      }
      slot.lob.visible =
        phase === 'telegraph' &&
        w.time > a.createdAt + 0.35 &&
        ['ember', 'spores', 'molten'].includes(a.kind);
      if (slot.lob.visible) {
        const progress = Math.min(
          1,
          Math.max(0, (w.time - a.createdAt - 0.35) / (a.armAt - a.createdAt - 0.35)),
        );
        slot.lob.position.copy(globalPosition(w.room, a.fromX, a.fromY, 1.25)).lerp(pos, progress);
        slot.lob.position.y += Math.sin(progress * Math.PI) * 2.6;
        slot.lob.material.color.set(AREA_RULES[a.kind].color);
      }
    });
  }
  dispose(): void {
    this.pool[0].ground.geometry.dispose();
    this.pool[0].volume.geometry.dispose();
    this.pool[0].lob.geometry.dispose();
    this.pool[0].ice.geometry.dispose();
    this.pool[0].ice.material.dispose();
    this.pool.forEach((s) => {
      s.ground.material.dispose();
      s.volume.material.dispose();
      s.lob.material.dispose();
      s.ice.dispose();
    });
    this.root.clear();
    this.activated.clear();
  }
}
