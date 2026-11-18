/** Biblioteca: cada um só vê as próprias fichas. Treino: só o criador marca, uma por pessoa. */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, createTestDatabase } from '../src/testing';

let drop: () => Promise<void>;
let sql: postgres.Sql;
let a: string, b: string;

async function as<T>(uid: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid })}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}

beforeAll(async () => {
  const db = await createTestDatabase('rpg_library_rls');
  drop = db.drop;
  sql = postgres(db.url, { max: 2, onnotice: () => undefined });
  a = await createAuthUser(sql, 'a@lib.com');
  b = await createAuthUser(sql, 'b@lib.com');
});
afterAll(async () => {
  await sql?.end();
  await drop?.();
});

describe('biblioteca e mesa de treino', () => {
  it('fichas da biblioteca são particulares', async () => {
    await as(
      a,
      (tx) => tx`insert into library_sheets (owner_id, kind, name) values (${a}, 'character', 'Minha')`,
    );
    await expect(
      as(a, (tx) => tx`insert into library_sheets (owner_id, kind, name) values (${b}, 'npc', 'Falsa')`),
    ).rejects.toThrow(/row-level security/);
    expect(await as(b, (tx) => tx`select id from library_sheets`)).toHaveLength(0);
    expect(await as(b, (tx) => tx`update library_sheets set name = 'x' returning id`)).toHaveLength(0);
    expect(await as(a, (tx) => tx`select name from library_sheets`)).toEqual([{ name: 'Minha' }]);
  });

  it('só o criador marca a campanha como treino, e só uma', async () => {
    const [org] = await sql`select id from organizations where owner_id = ${a}`;
    const mk = async () =>
      (
        await sql`insert into campaigns (organization_id, created_by, name) values (${org!.id}, ${a}, 'T') returning id`
      )[0]!.id as string;
    const c1 = await mk();
    const c2 = await mk();
    await sql`insert into campaign_members (campaign_id, user_id, role) values (${c1}, ${a}, 'owner'), (${c1}, ${b}, 'gm')`;
    await expect(as(b, (tx) => tx`select app_private.mark_sandbox(${c1})`)).rejects.toThrow(/forbidden/);
    await as(a, (tx) => tx`select app_private.mark_sandbox(${c1})`);
    await expect(as(a, (tx) => tx`select app_private.mark_sandbox(${c2})`)).rejects.toThrow(
      /campaigns_one_sandbox/,
    );
    await expect(as(a, (tx) => tx`update campaigns set sandbox = false where id = ${c1}`)).rejects.toThrow(
      /permission denied/,
    );
  });
});
