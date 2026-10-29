import { PROTOCOL_VERSION, BUILD_VERSION } from '../shared/protocol';
import { defineServer, defineRoom } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { CoopRoom } from './rooms/CoopRoom';
import { DuelRoom } from './rooms/DuelRoom';
import type { Request, Response, NextFunction } from 'express';

export function createServer() {
  const origins = new Set(
    (
      process.env.ALLOWED_ORIGINS ??
      'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,https://guardianec.github.io'
    ).split(','),
  );
  const allowed = (origin: string | null) => !origin || origins.has(origin);
  const requests = new Map<string, { count: number; until: number }>();
  return defineServer({
    greet: false,
    transport: new WebSocketTransport({
      maxPayload: 4096,
      pingInterval: 5000,
      pingMaxRetries: 2,
      beforeUpgrade: (request) => {
        if (!allowed(request.headers.get('origin')))
          return new Response('Origin denied', { status: 403 });
      },
    }),
    rooms: { coop: defineRoom(CoopRoom), duel: defineRoom(DuelRoom) },
    express: (app) => {
      app.use((req: Request, res: Response, next: NextFunction) => {
        const origin = req.headers.origin;
        if (!allowed(origin ?? null)) {
          res.status(403).json({ error: 'Origin denied' });
          return;
        }
        const now = Date.now(),
          key = req.socket.remoteAddress ?? 'unknown';
        const recent = requests.get(key);
        if (!recent || now > recent.until) {
          for (const [ip, entry] of requests) if (now > entry.until) requests.delete(ip);
          if (requests.size > 4096) requests.clear();
          requests.set(key, { count: 1, until: now + 60000 });
        } else if (++recent.count > 120) {
          res.status(429).json({ error: 'Too many requests. Try again shortly.' });
          return;
        }
        if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        if (req.method === 'OPTIONS') {
          res.sendStatus(204);
          return;
        }
        next();
      });
      app.get('/healthz', (_req: Request, res: Response) => {
        res.setHeader('Cache-Control', 'no-store');
        res.json({ ok: true, protocol: PROTOCOL_VERSION, build: BUILD_VERSION });
      });
    },
  });
}
