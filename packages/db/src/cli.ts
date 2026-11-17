import { bootstrapLocal, migrate } from './migrate';

async function main() {
  const cmd = process.argv[2];
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida. Veja .env.example.');
  if (cmd === 'migrate') {
    const r = await migrate(url);
    console.warn(
      `Migrations aplicadas: ${r.applied.join(', ') || 'nenhuma'} | já aplicadas: ${r.skipped.length}`,
    );
  } else if (cmd === 'bootstrap-local') {
    await bootstrapLocal(url);
    console.warn('Compatibilidade Supabase local aplicada.');
  } else {
    throw new Error('Uso: cli.js migrate | bootstrap-local');
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
