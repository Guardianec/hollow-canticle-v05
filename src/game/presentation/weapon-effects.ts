import * as T from 'three';
import type { Effect } from '../world';
import { Random } from '../random';

/** Thin, tapered steel afterimages; silhouettes remain visible through the strike. */
export function bladeRibbon(effect: Effect): T.BufferGeometry {
  const vertices: number[] = [],
    uv: number[] = [];
  const thrust = effect.attackKind === 'thrust';
  const radius = Math.min(2.5, Math.max(1.2, effect.scale * 1.35));
  const spread = effect.weapon === 'twins' ? 1.9 : effect.weapon === 'great' ? 1.65 : 1.4;
  const point = (t: number, side: number) => {
    const width = Math.sin(t * Math.PI) * (effect.weapon === 'great' ? 0.11 : 0.055);
    if (thrust) return [0.35 + t * radius, 0, side * width * 0.45];
    const a = (t - 0.5) * spread,
      r = radius - side * width;
    return [Math.cos(a) * r, 0, Math.sin(a) * r];
  };
  for (let i = 0; i < 32; i++) {
    const a = i / 32,
      b = (i + 1) / 32;
    for (const [t, side] of [
      [a, 0],
      [a, 1],
      [b, 1],
      [a, 0],
      [b, 1],
      [b, 0],
    ]) {
      vertices.push(...point(t, side));
      uv.push(t, side);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createWeaponEffect(effect: Effect, glow: T.Texture, density = 1): T.Group {
  const root = new T.Group();
  const strike = effect.kind === 'slash' || effect.kind === 'finish';
  if (strike) {
    const material = new T.ShaderMaterial({
      uniforms: { opacity: { value: 0 }, steel: { value: new T.Color('#d1e0df') } },
      vertexShader:
        'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'varying vec2 vUv;uniform float opacity;uniform vec3 steel;void main(){float taper=sin(vUv.x*3.14159);float edge=pow(1.-vUv.y,2.);gl_FragColor=vec4(steel,opacity*taper*(.15+.85*edge));}',
      side: T.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      toneMapped: true,
    });
    const ribbon = new T.Mesh(bladeRibbon(effect), material);
    ribbon.rotation.x =
      effect.attackKind === 'smash' ? Math.PI / 2 : effect.attackKind === 'sweep' ? -0.1 : -0.22;
    root.add(ribbon);
    if (effect.weapon === 'twins') {
      const second = new T.Mesh(bladeRibbon(effect), material.clone());
      second.rotation.x = 0.4;
      second.position.y = -0.18;
      second.rotation.y = -0.3;
      root.add(second);
    }
  } else if (effect.contact || effect.kind === 'perfect' || effect.kind === 'hurt') {
    const rng = new Random(`${effect.x}:${effect.y}:${effect.angle}:${effect.kind}`);
    const count = Math.max(
      6,
      Math.ceil(
        (effect.kind === 'perfect'
          ? 40
          : effect.kind === 'break'
            ? 30
            : effect.kind === 'hurt'
              ? 9
              : 18) * density,
      ),
    );
    const velocities = Array.from({ length: count }, (_, i) => {
      const angle = (rng.next() - 0.5) * (i % 5 === 0 ? Math.PI * 2 : 1.8);
      const speed = 1.8 + rng.next() * Math.min(7, 4 * effect.scale);
      return new T.Vector3(
        Math.cos(angle) * speed,
        0.5 + rng.next() * 3.4,
        Math.sin(angle) * speed,
      );
    });
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array(count * 6), 3).setUsage(T.DynamicDrawUsage),
    );
    const colors: number[] = [];
    for (let i = 0; i < count; i++)
      colors.push(
        ...(effect.projectileKind === 'orb'
          ? [0.55, 1.05, 0.85, 0.09, 0.35, 0.25]
          : effect.kind === 'break'
            ? [1.2, 0.18, 0.12, 0.5, 0.04, 0.02]
            : effect.kind === 'perfect' && i % 3 === 0
              ? [0.6, 0.85, 1.2, 0.1, 0.25, 0.5]
              : [1.1, 0.74, 0.32, 0.4, 0.16, 0.045]),
      );
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    const sparks = new T.LineSegments(
      geometry,
      new T.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    sparks.frustumCulled = false;
    sparks.userData.velocities = velocities;
    root.add(sparks);
    const core = new T.Sprite(
      new T.SpriteMaterial({
        map: glow,
        color: new T.Color(1.6, 1.25, 0.75),
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    core.scale.set(0.34, 0.34, 1);
    root.add(core);
    const glint = new T.Sprite(
      new T.SpriteMaterial({
        map: glow,
        color: '#e8f4f4',
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    glint.scale.set(0.65, 0.055, 1);
    root.add(glint);
  } else {
    const ring = new T.Mesh(
      new T.RingGeometry(0.78, 0.805, 48),
      new T.MeshBasicMaterial({
        color: effect.color,
        transparent: true,
        opacity: 0,
        side: T.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    root.add(ring);
  }
  if (
    effect.kind === 'perfect' ||
    effect.kind === 'break' ||
    (effect.kind === 'finish' && effect.weapon === 'great')
  ) {
    const ring = new T.Mesh(
      new T.RingGeometry(0.75, effect.kind === 'break' ? 0.84 : 0.78, 48),
      new T.MeshBasicMaterial({
        color: effect.kind === 'break' ? '#f4644a' : '#d8e8f5',
        transparent: true,
        side: T.DoubleSide,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    root.add(ring);
  }
  if (effect.weapon === 'shinobi' && strike) {
    const line = new T.Mesh(
      new T.PlaneGeometry(2.5, 0.035),
      new T.MeshBasicMaterial({
        color: '#fff1d5',
        transparent: true,
        side: T.DoubleSide,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    line.rotation.x = -Math.PI / 2;
    root.add(line);
  }
  return root;
}

export function updateWeaponEffect(
  root: T.Group,
  effect: Effect,
  time: number,
  reduced: boolean,
  flashes: boolean,
): void {
  const strike = effect.kind === 'slash' || effect.kind === 'finish';
  root.rotation.set(0, -effect.angle, 0);
  root.scale.setScalar(1);
  if (strike) root.rotation.y += reduced ? 0 : (time - 0.5) * 0.35;
  const fade = Math.max(0, 1 - time);
  for (const child of root.children) {
    if (child instanceof T.LineSegments) {
      const positions = child.geometry.attributes.position as T.BufferAttribute;
      const age = time * Math.min(0.4, effect.maxLife),
        motion = reduced ? 0.45 : 1;
      (child.userData.velocities as T.Vector3[]).forEach((velocity, i) => {
        for (let end = 0; end < 2; end++) {
          const t = Math.max(0, age - end * 0.023);
          positions.setXYZ(
            i * 2 + end,
            velocity.x * t * motion,
            (velocity.y * t - 5 * t * t) * motion,
            velocity.z * t * motion,
          );
        }
      });
      positions.needsUpdate = true;
      (child.material as T.LineBasicMaterial).opacity = fade * fade * 0.9;
    } else if (child instanceof T.Mesh) {
      if (child.material instanceof T.ShaderMaterial)
        child.material.uniforms.opacity.value = fade * (effect.kind === 'finish' ? 0.7 : 0.48);
      else {
        (child.material as T.MeshBasicMaterial).opacity = fade * 0.3;
        child.scale.setScalar(0.3 + time * effect.scale * 1.8);
      }
    } else if (child instanceof T.Sprite) {
      child.visible = flashes;
      child.material.opacity = Math.max(0, 1 - time * 5) * 0.8;
    }
  }
}
