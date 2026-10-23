import * as T from 'three';
import type { Room } from '../dungeon';
import { geometryFor } from '../geometry';
import { globalPosition } from './architecture';
import type { Materials } from './materials';

export function shrineWater(room: Room, materials: Materials) {
  const positions: number[] = [];
  for (const tile of geometryFor(room).tiles) {
    if (tile.x < 350 || tile.x > 760 || tile.y < 440) continue;
    const p = globalPosition(room, tile.x, tile.y),
      h = p.y + 0.035;
    const s = 0.51;
    positions.push(
      p.x - s,
      h,
      p.z - s,
      p.x - s,
      h,
      p.z + s,
      p.x + s,
      h,
      p.z + s,
      p.x - s,
      h,
      p.z - s,
      p.x + s,
      h,
      p.z + s,
      p.x + s,
      h,
      p.z - s,
    );
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return waterSurface(geometry, materials);
}

export function waterSurface(geometry: T.BufferGeometry, materials: Materials) {
  const ripples = { value: Array.from({ length: 8 }, () => new T.Vector4(0, 0, 100, 0)) };
  const material = new T.MeshStandardMaterial({
    color: '#255c64',
    metalness: 0.3,
    roughness: 0.16,
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = materials.time;
    shader.uniforms.uWaterRipples = ripples;
    shader.vertexShader = 'varying vec3 vWaterWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvWaterWorld=(modelMatrix*vec4(transformed,1.)).xyz;',
    );
    shader.fragmentShader =
      'varying vec3 vWaterWorld;uniform float uWaterTime;uniform vec4 uWaterRipples[8];\n' +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      float waves=sin(vWaterWorld.x*2.2+uWaterTime*.8)*cos(vWaterWorld.z*2.7-uWaterTime*.6);
      normal=normalize(normal+vec3(waves*.065,sin(vWaterWorld.z*3.+uWaterTime)*.04,0.));
      float foam=0.;for(int i=0;i<8;i++){float d=distance(vWaterWorld.xz,uWaterRipples[i].xy);float age=uWaterRipples[i].z;
        foam+=exp(-abs(d-age*2.4)*9.)*exp(-age*1.8)*uWaterRipples[i].w;}
      diffuseColor.rgb*=.83+.17*sin(vWaterWorld.x*.6+vWaterWorld.z*.4);
      diffuseColor.rgb+=vec3(.15,.29,.28)*foam;`,
    );
  };
  const mesh = new T.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.userData.shaderWater = true;
  mesh.userData.ripples = ripples;
  return mesh;
}
