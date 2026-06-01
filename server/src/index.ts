import { startServer } from './ws/server.ts';

const port = Number(process.env.PORT ?? '8080');
startServer(port);
