import { canStand, geometryFor } from '../src/game/geometry';
import type { Obstacle, Room } from '../src/game/dungeon';

/** The identical wall/obstacle resolver is used by authority and movement replay. */
export function moveBody(
  body: { x: number; y: number },
  dx: number,
  dy: number,
  room: Room,
  obstacles: Obstacle[],
): void {
  const gates = !room.cleared && room.enemies.length ? geometryFor(room).sockets : [];
  const valid = (x: number, y: number) =>
    canStand(room, x, y) &&
    !gates.some((s) =>
      s.dx
        ? Math.abs(y - s.y) < s.width / 2 + 16 && (s.dx > 0 ? x > s.x - 20 : x < s.x + 20)
        : Math.abs(x - s.x) < s.width / 2 + 16 && (s.dy > 0 ? y > s.y - 20 : y < s.y + 20),
    );
  const resolve = () => {
    for (const o of obstacles) {
      const distance = Math.hypot(body.x - o.x, body.y - o.y),
        min = o.radius + 16;
      if (distance < min) {
        const angle = Math.atan2(body.y - o.y, body.x - o.x);
        body.x = o.x + Math.cos(angle) * min;
        body.y = o.y + Math.sin(angle) * min;
      }
    }
  };
  const x = Math.min(1048, Math.max(72, body.x + dx));
  if (valid(x, body.y)) body.x = x;
  resolve();
  const y = Math.min(680, Math.max(90, body.y + dy));
  if (valid(body.x, y)) body.y = y;
  resolve();
}
