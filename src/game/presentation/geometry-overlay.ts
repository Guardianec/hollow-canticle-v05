import * as T from 'three';
import { geometryFor, CELL } from '../geometry';
import { globalPosition } from './architecture';
import type { World } from '../world';

export class GeometryOverlay {
  readonly root = new T.Group();
  private room?: object;
  update(world: World): void {
    this.root.visible = world.debug && world.lab.geometry;
    if (!this.root.visible || this.room === world.room) return;
    this.dispose();
    this.room = world.room;
    const geo = geometryFor(world.room);
    const lines = (segments: number[][], color: string, height = 0.12) => {
      const vertices = segments.flatMap(([x, y, bx, by]) => [
        ...globalPosition(world.room, x, y, height).toArray(),
        ...globalPosition(world.room, bx, by, height).toArray(),
      ]);
      const mesh = new T.LineSegments(
        new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(vertices, 3)),
        new T.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 }),
      );
      mesh.renderOrder = 100;
      this.root.add(mesh);
    };
    lines(
      geo.tiles.flatMap((t) => [
        [t.x - CELL / 2, t.y - CELL / 2, t.x + CELL / 2, t.y - CELL / 2],
        [t.x - CELL / 2, t.y - CELL / 2, t.x - CELL / 2, t.y + CELL / 2],
      ]),
      '#64d789',
    );
    lines(
      geo.walls.map((w) => [
        w.x - (w.dy * CELL) / 2,
        w.y - (w.dx * CELL) / 2,
        w.x + (w.dy * CELL) / 2,
        w.y + (w.dx * CELL) / 2,
      ]),
      '#ff5050',
      0.2,
    );
    lines(
      geo.sockets.map((s) => [
        s.x - (s.dy * s.width) / 2,
        s.y - (s.dx * s.width) / 2,
        s.x + (s.dy * s.width) / 2,
        s.y + (s.dx * s.width) / 2,
      ]),
      '#ffe179',
      0.3,
    );
    lines(
      geo.sockets.map((s) => [560, 380, s.x, s.y]),
      '#5bcafa',
      0.25,
    );
    lines(
      geo.obstacles.flatMap((o) =>
        Array.from({ length: 24 }, (_, i) => [
          o.x + Math.cos((i / 12) * Math.PI) * o.radius,
          o.y + Math.sin((i / 12) * Math.PI) * o.radius,
          o.x + Math.cos(((i + 1) / 12) * Math.PI) * o.radius,
          o.y + Math.sin(((i + 1) / 12) * Math.PI) * o.radius,
        ]),
      ),
      '#f79b45',
      0.25,
    );
  }
  dispose(): void {
    this.root.children.forEach((mesh) => {
      if (mesh instanceof T.LineSegments) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    });
    this.root.clear();
  }
}
