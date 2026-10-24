import { createServer } from './app';
const server = createServer();
await server.listen(Number(process.env.PORT ?? 2567), '0.0.0.0');
console.log('Hollow Canticle authority listening on', process.env.PORT ?? 2567);
