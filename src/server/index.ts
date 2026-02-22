import { buildServer } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const app = buildServer();

const stopSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const signal of stopSignals) {
  process.on(signal, () => {
    void app.close();
  });
}

try {
  await app.listen({ host, port });
  app.log.info(`API listening on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
