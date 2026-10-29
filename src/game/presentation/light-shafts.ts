import * as T from 'three';
import type { World } from '../world';
import type { Room } from '../dungeon';
import { shaftOpenings, type ShaftOpening } from '../light-shafts';
import { WEATHER_QUALITY } from '../atmosphere';
import { globalPosition } from './architecture';
import { Random } from '../random';

const TINTS = [
  ['#b9d4e2', '#d7e2e0', '#91b5cd'],
  ['#bee4e5', '#e1eeea', '#8fc5d0'],
  ['#b3a2cd', '#84bab0', '#9a9fc7'],
  ['#e1edf1', '#b4d4e7', '#d1dfe7'],
  ['#e2cfb7', '#adbecb', '#e5b183'],
];
const QUALITY = {
  'very-low': { samples: 1, detail: 0, dust: 2 },
  low: { samples: 1, detail: 0, dust: 4 },
  medium: { samples: 2, detail: 1, dust: 8 },
  high: { samples: 3, detail: 2, dust: 16 },
  extreme: { samples: 5, detail: 3, dust: 32 },
};
const vertexShader = `uniform float aperture;varying vec3 localPosition;
void main(){vec3 p=position;p.xz*=mix(1.,aperture/.08,p.y);localPosition=p;
gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
const fragmentShader = `
uniform vec3 cameraLocal,tint;uniform float clock,strength,aperture,seed,detail,samples;
varying vec3 localPosition;
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){
  vec3 o=cameraLocal,d=normalize(localPosition-o);float nearT=0.,farT=10000.;
  if(abs(d.y)<.00001){if(o.y<0.||o.y>1.)discard;}
  else{float a=-o.y/d.y,b=(1.-o.y)/d.y;nearT=max(nearT,min(a,b));farT=min(farT,max(a,b));}
  float k=aperture-1.,r=1.+k*o.y;
  float a=dot(d.xz,d.xz)-k*k*d.y*d.y;
  float b=2.*(dot(o.xz,d.xz)-r*k*d.y),c=dot(o.xz,o.xz)-r*r;
  if(abs(a)<.00001){if(abs(b)>.00001){float t=-c/b;if(b>0.)farT=min(farT,t);else nearT=max(nearT,t);}else if(c>0.)discard;}
  else{float discriminant=b*b-4.*a*c;if(discriminant<0.){if(a>0.)discard;}
    else{float root=sqrt(max(0.,discriminant));float t0=(-b-root)/(2.*a),t1=(-b+root)/(2.*a);
      float lo=min(t0,t1),hi=max(t0,t1);
      if(a>0.){nearT=max(nearT,lo);farT=min(farT,hi);}else if(nearT<lo)farT=min(farT,lo);else nearT=max(nearT,hi);}}
  if(farT<=nearT)discard;
  float density=0.;
  for(int i=0;i<5;i++){
    if(float(i)>=samples)break;
    vec3 p=o+d*mix(nearT,farT,(float(i)+.5)/samples);
    float radius=max(.001,1.+k*p.y),radial=length(p.xz)/radius;
    float edge=1.-smoothstep(.2,1.,radial);
    float ends=smoothstep(0.,.14,p.y)*(1.-smoothstep(.7,1.,p.y));
    float n=1.;
    if(detail>.5){vec3 q=p*vec3(3.,11.,3.)+vec3(seed,clock*.018,seed*.37);
      n=.48+.52*noise(q);
      float apertureMask=noise(vec3(p.xz/radius*3.5,seed));n*=smoothstep(.12,.78,apertureMask);
      if(detail>1.5)n*=.7+.3*noise(q*2.1+clock*.009);
      if(detail>2.5)n*=.82+.18*noise(q*4.2);}
    density+=edge*ends*n;
  }
  float opticalDepth=(farT-nearT)*density/samples;
  float alpha=(1.-exp(-opticalDepth*1.3))*strength;
  if(alpha<.001)discard;
  gl_FragColor=vec4(tint,alpha);
}`;

/** Analytic cone intersections give soft volume edges without stacked cards or scene raymarching. */
export class LightShafts {
  readonly root = new T.Group();
  dustCount = 0;
  private beams: T.Mesh<T.CylinderGeometry, T.ShaderMaterial>[] = [];
  private room?: Room;
  private biome = -1;
  private openings: ShaftOpening[] = [];
  private axis = new T.Vector3(0, 1, 0);
  private direction = new T.Vector3();
  private camera = new T.Vector3();
  private dust: T.Points<T.BufferGeometry, T.ShaderMaterial>;
  private dustUniforms = {
    clock: { value: 0 },
    perBeam: { value: 0 },
    transforms: { value: Array.from({ length: 3 }, () => new T.Matrix4()) },
    tints: { value: Array.from({ length: 3 }, () => new T.Color()) },
    powers: { value: [0, 0, 0] },
    apertures: { value: [0, 0, 0] },
  };
  constructor() {
    const geometry = new T.CylinderGeometry(0.08, 1, 1, 24, 1, false).translate(0, 0.5, 0);
    for (let i = 0; i < 3; i++) {
      const material = new T.ShaderMaterial({
        uniforms: {
          cameraLocal: { value: new T.Vector3() },
          tint: { value: new T.Color() },
          clock: { value: 0 },
          strength: { value: 0 },
          aperture: { value: 0.08 },
          seed: { value: 0 },
          detail: { value: 0 },
          samples: { value: 1 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: T.BackSide,
        blending: T.AdditiveBlending,
        toneMapped: false,
      });
      const mesh = new T.Mesh(geometry, material);
      mesh.visible = false;
      mesh.renderOrder = 1;
      mesh.frustumCulled = false;
      this.beams.push(mesh);
      this.root.add(mesh);
    }
    const rng = new Random('fracture-dust'),
      positions = new Float32Array(3 * 32 * 3),
      indices = new Float32Array(3 * 32);
    for (let i = 0; i < indices.length; i++) {
      positions.set([rng.next(), rng.next(), rng.next()], i * 3);
      indices[i] = i;
    }
    const dustGeo = new T.BufferGeometry()
      .setAttribute('position', new T.BufferAttribute(positions, 3))
      .setAttribute('particle', new T.BufferAttribute(indices, 1));
    this.dust = new T.Points(
      dustGeo,
      new T.ShaderMaterial({
        uniforms: this.dustUniforms,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        toneMapped: false,
        vertexShader: `attribute float particle;uniform mat4 transforms[3];uniform vec3 tints[3];uniform float powers[3],apertures[3],clock,perBeam;varying vec3 tint;varying float alpha;
      void main(){int beam=int(floor(particle/32.));float index=mod(particle,32.);
        float y=fract(position.y+clock*.012);float radius=mix(1.,apertures[beam],y);
        float r=sqrt(position.x)*radius*.84,a=position.z*6.283185+clock*.045;
        vec3 p=vec3(cos(a)*r,y,sin(a)*r);
        vec4 mv=viewMatrix*transforms[beam]*vec4(p,1.);gl_Position=projectionMatrix*mv;
        alpha=(1.-position.x)*smoothstep(0.,.12,y)*(1.-smoothstep(.7,1.,y))*powers[beam];
        if(index>=perBeam)alpha=0.;tint=tints[beam];gl_PointSize=clamp(28./max(5.,-mv.z),1.,2.3);}`,
        fragmentShader: `varying vec3 tint;varying float alpha;void main(){float a=(1.-smoothstep(.05,.5,length(gl_PointCoord-.5)))*alpha;if(a<.005)discard;gl_FragColor=vec4(tint,a);}`,
      }),
    );
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 2;
    this.root.add(this.dust);
  }
  update(w: World, cameraPosition: T.Vector3, critical: number): void {
    if (this.room !== w.room || this.biome !== w.floor.biome) {
      this.room = w.room;
      this.biome = w.floor.biome;
      this.openings = shaftOpenings(w.room, this.biome);
    }
    const quality = QUALITY[w.save.settings.detail],
      clock = w.save.settings.reducedMotion ? 0 : w.visualTime;
    const count = w.weather.shafts
      ? Math.min(this.openings.length, WEATHER_QUALITY[w.save.settings.detail].shafts)
      : 0;
    const attenuation =
      (critical ? 0.45 : 1) * (this.biome === 2 ? 0.5 : 1) * (w.onlineMode === 'duel' ? 0.55 : 1);
    this.dustCount = count * quality.dust;
    this.dustUniforms.clock.value = clock;
    this.dustUniforms.perBeam.value = quality.dust;
    this.dust.geometry.setDrawRange(0, count * 32);
    this.dust.visible = count > 0;
    this.beams.forEach((beam, i) => {
      beam.visible = i < count;
      this.dustUniforms.powers.value[i] = 0;
      if (i >= count) return;
      const opening = this.openings[i],
        uniforms = beam.material.uniforms;
      beam.position.copy(globalPosition(w.room, opening.x, opening.y, 0.025));
      this.direction.set(opening.leanX, 1, opening.leanY).normalize();
      beam.quaternion.setFromUnitVectors(this.axis, this.direction);
      beam.scale.set(opening.radius, opening.height, opening.radius * opening.aspect);
      beam.updateMatrixWorld(true);
      uniforms.cameraLocal.value.copy(beam.worldToLocal(this.camera.copy(cameraPosition)));
      uniforms.tint.value.set(TINTS[this.biome][opening.tint]);
      uniforms.clock.value = clock;
      uniforms.strength.value = opening.strength * attenuation;
      uniforms.aperture.value = opening.aperture;
      uniforms.seed.value = opening.seed;
      uniforms.detail.value = quality.detail;
      uniforms.samples.value = quality.samples;
      this.dustUniforms.transforms.value[i].copy(beam.matrixWorld);
      this.dustUniforms.tints.value[i].copy(uniforms.tint.value);
      this.dustUniforms.powers.value[i] = 0.65 * attenuation;
      this.dustUniforms.apertures.value[i] = opening.aperture;
    });
  }
  dispose(): void {
    this.beams[0].geometry.dispose();
    this.beams.forEach((b) => b.material.dispose());
    this.dust.geometry.dispose();
    this.dust.material.dispose();
    this.root.clear();
  }
}
