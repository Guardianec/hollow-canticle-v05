import * as T from 'three';

/** A floor seal matches the real interaction radius. No bloom or screen-facing portal. */
export function descentSeal(position: T.Vector3): T.Group {
  const group = new T.Group();
  group.position.copy(position).add(new T.Vector3(0, 0.055, 0));
  const material = new T.MeshBasicMaterial({
    color: '#d4bc83',
    transparent: true,
    opacity: 0.7,
    side: T.DoubleSide,
    depthWrite: false,
    toneMapped: true,
  });
  const ring = new T.Mesh(new T.RingGeometry(2.68, 2.72, 64, 1, 0, Math.PI * 1.8), material);
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  const lines: number[] = [];
  for (let i = 0; i < 3; i++) {
    const z = -0.55 + i * 0.38;
    lines.push(-0.42, 0, z, 0, 0, z + 0.27, 0, 0, z + 0.27, 0.42, 0, z);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(lines, 3));
  group.add(
    new T.LineSegments(
      geometry,
      new T.LineBasicMaterial({ color: '#e6d7af', transparent: true, opacity: 0.9 }),
    ),
  );
  return group;
}
