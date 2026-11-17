import { createApp } from './app.factory';
import { loadConfig } from './config';

async function bootstrap() {
  const config = loadConfig();
  const { app } = await createApp(config);
  await app.listen(config.API_PORT);
  console.warn(`API ouvindo em http://localhost:${config.API_PORT}`);
}

bootstrap().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
