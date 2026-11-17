import { migrate } from '@rpg-ai/db';
import { createApp } from './app.factory';
import { loadConfig } from './config';

async function bootstrap() {
  const config = loadConfig();
  if (config.MIGRATE_ON_START) {
    const r = await migrate(config.DATABASE_URL);
    console.warn(`Migrations aplicadas: ${r.applied.join(', ') || 'nenhuma nova'}`);
  }
  const { app } = await createApp(config);
  await app.listen(config.API_PORT);
  console.warn(`API ouvindo em http://localhost:${config.API_PORT}`);
}

bootstrap().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
