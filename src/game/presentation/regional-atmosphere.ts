import * as T from 'three';
import { ATMOSPHERES, WEATHER_QUALITY, weatherBudget, weatherIntensity } from '../atmosphere';
import type { World } from '../world';
import { globalPosition } from './architecture';
import { LightShafts } from './light-shafts';

/** Local weather and seeded overhead scattering share fixed reusable GPU pools. */
export class RegionalAtmosphere {
  readonly root = new T.Group();
  readonly wind = new T.Vector2();
  particleCount = 0;
  intensity = 0;
  private points: T.Points<T.BufferGeometry, T.ShaderMaterial>;
  private shafts = new LightShafts();
  private uniforms = {
    clock: { value: 0 },
    origin: { value: new T.Vector3() },
    tint: { value: new T.Color() },
    wind: { value: this.wind },
    fall: { value: 0 },
    size: { value: 2 },
    spread: { value: 20 },
    layers: { value: 1 },
    rain: { value: 0 },
    activity: { value: 0 },
    opacity: { value: 0.5 },
  };
  constructor() {
    const seeds = new Float32Array(1800 * 3);
    let seed = 813;
    for (let i = 0; i < seeds.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      seeds[i] = (seed >>> 0) / 4294967296;
    }
    const geometry = new T.BufferGeometry().setAttribute(
      'position',
      new T.BufferAttribute(seeds, 3),
    );
    this.points = new T.Points(
      geometry,
      new T.ShaderMaterial({
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        vertexShader: `uniform float clock,fall,size,spread,layers,rain,activity; uniform vec2 wind; uniform vec3 origin; varying float alpha;
        void main(){ vec3 p=position;float layer=floor(position.z*layers),range=spread*(1.+layer*.25);
          p.x=mod(p.x*range*2.+clock*wind.x*(1.+layer*.12),range*2.)-range;
          p.z=mod(fract(p.z*layers)*range*2.+clock*wind.y,range*2.)-range;
          p.y=1.5+layer*.8+mod(p.y*15.-clock*fall,15.); p.x+=sin(clock*.35+position.z*30.)*.45;
          alpha=(.45+position.x*.55)*(1.-smoothstep(range*.55,range,length(p.xz)))/(1.+layer*.25);
          alpha*=mix(1.,.15,activity*(1.-smoothstep(2.,5.,length(p.xz))));
          vec4 mv=modelViewMatrix*vec4(p+origin,1.);gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp(size*35./max(4.,-mv.z),1.,rain>0.5?9.:6.); }`,
        fragmentShader: `uniform vec3 tint;uniform float opacity,rain;varying float alpha;
        void main(){vec2 uv=gl_PointCoord-.5;uv.x*=mix(1.,3.7,rain);
          float a=(1.-smoothstep(.13,.5,length(uv)))*alpha*opacity;
          if(a<.012)discard;gl_FragColor=vec4(tint,a);}`,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.root.add(this.points);
    this.root.add(this.shafts.root);
  }
  update(w: World, cameraPosition?: T.Vector3): void {
    const region = ATMOSPHERES[w.floor.biome],
      quality = WEATHER_QUALITY[w.save.settings.detail];
    const time = w.save.settings.reducedMotion ? 0 : w.visualTime;
    this.intensity =
      w.weather.intensity < 0 ? weatherIntensity(time, w.floor.biome) : w.weather.intensity;
    if (w.floor.biome === 3 && w.alive.some((e) => e.def.id === 'boss' && e.phase === 2))
      this.intensity = Math.max(this.intensity, 1.1);
    this.wind
      .set(
        (0.45 + Math.sin(time * 0.04) * 0.3) * region.wind,
        Math.cos(time * 0.025) * 0.28 * region.wind,
      )
      .multiplyScalar(w.weather.wind);
    const critical =
      w.areas.active.length +
      w.effects.filter((e) => ['perfect', 'break', 'finish'].includes(e.kind)).length;
    this.particleCount = Math.min(
      1800,
      Math.round(
        weatherBudget(w.save.settings.detail, this.intensity, critical, w.onlineMode === 'duel') *
          w.weather.density,
      ),
    );
    this.points.geometry.setDrawRange(0, this.particleCount);
    const p = globalPosition(w.room, w.player.x, w.player.y);
    this.uniforms.clock.value = time;
    this.uniforms.origin.value.copy(p);
    this.uniforms.tint.value.set(region.color);
    this.uniforms.fall.value = region.fall;
    this.uniforms.size.value = region.size;
    this.uniforms.spread.value = quality.distance;
    this.uniforms.layers.value = quality.layers;
    this.uniforms.rain.value = w.floor.biome === 1 ? 1 : 0;
    this.uniforms.activity.value = critical ? 0.85 : 0;
    this.uniforms.opacity.value = w.onlineMode === 'duel' ? 0.3 : 0.5;
    this.shafts.update(w, cameraPosition ?? p, critical);
  }
  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.shafts.dispose();
    this.root.clear();
  }
}
