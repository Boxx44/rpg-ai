// Recria o banco de testes E2E do zero (compat Supabase + migrations).
import db from '@rpg-ai/db';
import postgres from 'postgres';

const url = new URL(process.env.DATABASE_URL);
const name = url.pathname.slice(1);
if (!name.includes('e2e')) throw new Error('prepare-db só roda em bancos de teste E2E');
const admin = new URL(url);
admin.pathname = '/postgres';
const sql = postgres(admin.toString(), { max: 1, onnotice: () => undefined });
await sql.unsafe(`drop database if exists "${name}" with (force)`);
await sql.unsafe(`create database "${name}"`);
await sql.end();
await db.bootstrapLocal(url.toString());
await db.migrate(url.toString());
console.warn(`[e2e] banco ${name} pronto`);
