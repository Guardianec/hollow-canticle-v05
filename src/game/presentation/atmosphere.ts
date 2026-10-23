import * as T from 'three';

export const FOG_COLORS = ['#172a3b', '#123b40', '#241c39', '#596f83', '#2e201c'];

export function voidBackground(biome = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, ['#070f1b', '#061a21', '#100b1e', '#25384c', '#100c0b'][biome]);
  gradient.addColorStop(0.68, FOG_COLORS[biome]);
  gradient.addColorStop(1, FOG_COLORS[biome]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 2, 256);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

/** Keep distance fog and add height extinction below the nearest walking elevation. */
export function heightFog(
  material: T.Material,
  floor: { value: number },
  color: { value: T.Color },
  player?: T.Vector3,
) {
  if (material.userData.heightFog) return;
  material.userData.heightFog = true;
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.uWalkingHeight = floor;
    shader.uniforms.uChasmColor = color;
    shader.vertexShader = 'varying vec3 vMistWorld;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `
      #include <worldpos_vertex>
      vec4 mistPosition=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        mistPosition=instanceMatrix*mistPosition;
      #endif
      vMistWorld=(modelMatrix*mistPosition).xyz;
    `,
    );
    shader.fragmentShader =
      'varying vec3 vMistWorld; uniform float uWalkingHeight; uniform vec3 uChasmColor;\n' +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `
      #include <fog_fragment>
      float below=max(0.,uWalkingHeight-vMistWorld.y);
      float depthOpacity=1.-exp(-below*below*.024);
      vec3 heightTint=linearToOutputTexel(vec4(uChasmColor,1.)).rgb;
      gl_FragColor.rgb=mix(gl_FragColor.rgb,heightTint,depthOpacity);
    `,
    );
    if (player) {
      shader.uniforms.uArtPlayer = { value: player };
      shader.fragmentShader = 'uniform vec3 uArtPlayer;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>
        vec3 sight=normalize(uArtPlayer+vec3(0.,1.,0.)-cameraPosition);
        float along=dot(vMistWorld-cameraPosition,sight);
        float radial=length(vMistWorld-cameraPosition-sight*along);
        if(along>0.&&along<length(uArtPlayer-cameraPosition)-.5&&radial<.65&&vMistWorld.y>uArtPlayer.y+.3&&mod(gl_FragCoord.x+gl_FragCoord.y,4.)>0.)discard;
      `,
      );
    }
  };
  material.customProgramCacheKey = () => previousKey + ':height-fog-v05:' + Boolean(player);
  material.needsUpdate = true;
}

export function chasmMist(time: { value: number }, color: T.Color) {
  return new T.ShaderMaterial({
    uniforms: { time, tint: { value: color } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv; uniform float time; uniform vec3 tint;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){vec2 p=vUv*9.+vec2(time*.013,time*-.008);float n=noise(p)*.6+noise(p*2.7)*.25+noise(p*7.)*.15;
        float edge=smoothstep(0.,.24,vUv.x)*smoothstep(0.,.24,1.-vUv.x)*smoothstep(0.,.24,vUv.y)*smoothstep(0.,.24,1.-vUv.y);
        gl_FragColor=vec4(tint,edge*(.12+n*.32));
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
  });
}
