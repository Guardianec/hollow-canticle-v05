// Local-only reliable WebSocket delay: npm run net:proxy -- 100 15
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
const presets = { LAN: [0, 0], 50: [50, 5], 100: [100, 10], 150: [150, 15], BAD: [200, 40] };
const [rtt, jitter] = presets[process.argv[2]] ?? [
  Number(process.argv[2] ?? 100),
  Number(process.argv[3] ?? 10),
];
if (![rtt, jitter].every((n) => Number.isFinite(n) && n >= 0 && n <= 2000))
  throw new Error('Delay must be 0–2000 ms');
const server = http.createServer((request, response) => {
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: 2567,
      path: request.url,
      method: request.method,
      headers: request.headers,
    },
    (res) => {
      response.writeHead(res.statusCode ?? 502, res.headers);
      res.pipe(response);
    },
  );
  upstream.on('error', () => {
    response.writeHead(503);
    response.end('Authority is offline');
  });
  request.pipe(upstream);
});
const sockets = new WebSocketServer({ server });
sockets.on('connection', (downstream, request) => {
  const upstream = new WebSocket(`ws://127.0.0.1:2567${request.url}`, {
    headers: request.headers.origin ? { origin: request.headers.origin } : {},
  });
  const timers = new Set(),
    pending = [];
  // Preserve ordering: jitter models delayed reliable delivery, not corrupt Schema deltas.
  const lane = (target) => {
    let last = 0;
    return (data, isBinary) => {
      const now = Date.now(),
        at = Math.max(last, now + rtt / 2 + (Math.random() * 2 - 1) * jitter);
      last = at;
      const timer = setTimeout(
        () => {
          timers.delete(timer);
          if (target.readyState === WebSocket.OPEN) target.send(data, { binary: isBinary });
        },
        Math.max(0, at - now),
      );
      timers.add(timer);
    };
  };
  const toServer = lane(upstream),
    toClient = lane(downstream);
  downstream.on('message', (data, binary) => {
    if (upstream.readyState === WebSocket.CONNECTING) pending.push([data, binary]);
    else toServer(data, binary);
  });
  upstream.on('open', () => {
    for (const [data, binary] of pending.splice(0)) toServer(data, binary);
  });
  upstream.on('message', toClient);
  const close = (code) => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    const status = typeof code === 'number' && code >= 4000 && code <= 4999 ? code : 1001;
    upstream.close(status);
    downstream.close(status);
  };
  downstream.on('close', close);
  upstream.on('close', close);
  upstream.on('error', close);
  downstream.on('error', close);
});
server.listen(2570, '127.0.0.1', () =>
  console.log(`Local proxy :2570 → :2567, ${rtt}ms RTT, ±${jitter}ms jitter per direction`),
);
