import * as T from 'three';
import type { Room } from '../dungeon';
import { geometryFor } from '../geometry';
import { Random } from '../random';
import { globalPosition } from './architecture';

export function roomDecals(room: Room, biome: number) {
  const rng = new Random(room.artSeed + ':surface-wear');
  const tiles = geometryFor(room).tiles;
  const material = new T.ShaderMaterial({
    uniforms: T.UniformsUtils.merge([
      T.UniformsLib.fog,
      {
        tint: {
          value: new T.Color(['#283d23', '#0c2924', '#312138', '#abbfc5', '#1c100b'][biome]),
        },
      },
    ]),
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `varying vec2 vUv;uniform vec3 tint;
      #include <fog_pars_fragment>
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){vec2 p=vUv-.5;float edge=1.-smoothstep(.08,.5,length(p));float grain=hash(floor(vUv*70.));
        float coverage=sin(vUv.x*18.+sin(vUv.y*13.)*3.)*.5+.5;float alpha=edge*smoothstep(.2,.65,coverage)*(.2+grain*.25);
        gl_FragColor=vec4(tint,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new T.InstancedMesh(new T.PlaneGeometry(1, 1), material, Math.min(12, tiles.length));
  const dummy = new T.Object3D();
  mesh.userData.surfaceDecal = true;
  dummy.rotation.x = -Math.PI / 2;
  for (let i = 0; i < mesh.count; i++) {
    const tile = rng.pick(tiles),
      p = globalPosition(room, tile.x, tile.y);
    dummy.position.copy(p);
    dummy.position.y += 0.012;
    dummy.rotation.z = rng.next() * Math.PI * 2;
    dummy.scale.set(1 + rng.next() * 1.6, 1 + rng.next() * 1.6, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  return mesh;
}
