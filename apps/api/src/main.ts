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
  const port = config.PORT ?? config.API_PORT;
  await app.listen(port, '0.0.0.0');
  console.warn(`API ouvindo na porta ${port}`);
}

bootstrap().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
