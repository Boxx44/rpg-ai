/** Segredos no mapa: só quem descobriu vê a peça (direto no banco). */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, createTestDatabase } from '../src/testing';

let drop: () => Promise<void>;
let sql: postgres.Sql;
let gm: string, ana: string, bia: string;
let cid: string, mapId: string, key: string, chest: string, far: string;
class Rollback extends Error {}

async function as<T>(uid: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let out!: T;
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: 'authenticated' })}, true)`;
      await tx`set local role authenticated`;
      out = await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out;
}
const sees = async (uid: string) =>
  (await as(uid, (tx) => tx`select label from map_tokens where map_id = ${mapId} order by label`)).map(
    (r) => r.label,
  );
/** O servidor chama a função com a própria conexão (sem papel de usuário). */
const reveal = async (uid: string, x: number, y: number, skill: string, total: number) =>
  (
    await sql`select * from app_private.reveal_secrets(${mapId}, ${uid}, ${x}, ${y}, 1, ${skill}, ${total})`
  ).map((r) => r.reveal_secrets as string);

beforeAll(async () => {
  const db = await createTestDatabase('rpg_secrets_rls');
  drop = db.drop;
  sql = postgres(db.url, { max: 2, onnotice: () => undefined });
  [gm, ana, bia] = await Promise.all(
    ['gm', 'ana', 'bia'].map((n) => createAuthUser(sql, `${n}@example.com`, { display_name: n })),
  );
  const [org] = await sql`select id from organizations where owner_id = ${gm}`;
  const [c] =
    await sql`insert into campaigns (organization_id, created_by, name) values (${org!.id}, ${gm}, 'Mesa') returning id`;
  cid = c!.id;
  await sql`insert into campaign_members (campaign_id, user_id, role) values (${cid}, ${gm}, 'owner'), (${cid}, ${ana}, 'player'), (${cid}, ${bia}, 'player')`;
  const [m] =
    await sql`insert into maps (campaign_id, created_by, name, shared) values (${cid}, ${gm}, 'Sala', true) returning id`;
  mapId = m!.id;
  const tok = async (label: string, x: number, y: number, extra: Record<string, unknown>) => {
    const [r] =
      await sql`insert into map_tokens ${sql({ map_id: mapId, campaign_id: cid, kind: 'object', label, x, y, ...extra })} returning id`;
    return r!.id as string;
  };
  await tok('Mesa', 0, 0, {});
  key = await tok('Chave', 5, 5, {
    hidden: true,
    secret_skill: 'percepcao',
    secret_dt: 15,
    secret_radius: 2,
  });
  chest = await tok('Baú', 6, 5, {
    hidden: true,
    secret_skill: 'investigacao',
    secret_dt: 10,
    secret_radius: 2,
    icon: 'chest',
    state: 'closed',
  });
  far = await tok('Alçapão', 20, 20, {
    hidden: true,
    secret_skill: 'percepcao',
    secret_dt: 5,
    secret_radius: 1,
  });
  await tok('Emboscada', 4, 4, { hidden: true });
});
afterAll(async () => {
  await sql?.end();
  await drop?.();
});

describe('segredos no mapa', () => {
  it('ninguém além do mestre vê peças ocultas antes de descobrir', async () => {
    expect(await sees(gm)).toEqual(['Alçapão', 'Baú', 'Chave', 'Emboscada', 'Mesa']);
    expect(await sees(ana)).toEqual(['Mesa']);
  });

  it('rolagem baixa não acha nada; longe demais também não', async () => {
    expect(await reveal(ana, 4, 5, 'percepcao', 14)).toEqual([]);
    expect(await reveal(ana, 4, 5, 'percepcao', 30)).toEqual([key]); // alçapão está longe
    expect(await sees(ana)).toEqual(['Chave', 'Mesa']);
    // a outra jogadora continua sem ver
    expect(await sees(bia)).toEqual(['Mesa']);
    // achar de novo não duplica
    expect(await reveal(ana, 4, 5, 'percepcao', 30)).toEqual([]);
  });

  it('cada segredo pede a própria perícia; peça só oculta (sem segredo) nunca aparece', async () => {
    expect(await reveal(bia, 7, 6, 'percepcao', 40)).toEqual([key]);
    expect(await reveal(bia, 7, 6, 'investigacao', 12)).toEqual([chest]);
    expect(await sees(bia)).toEqual(['Baú', 'Chave', 'Mesa']);
    expect(await reveal(bia, 4, 4, 'percepcao', 60)).not.toContain('Emboscada');
  });

  it('quem descobriu o baú pode abri-lo; quem não descobriu nem sabe que existe', async () => {
    expect((await as(bia, (tx) => tx`select app_private.toggle_prop(${chest}) as s`))[0]!.s).toBe('open');
    await expect(as(ana, (tx) => tx`select app_private.toggle_prop(${chest})`)).rejects.toThrow(/not found/);
  });

  it('jogador não consegue se revelar sozinho', async () => {
    await expect(
      as(
        ana,
        (tx) => tx`select * from app_private.reveal_secrets(${mapId}, ${ana}, 20, 20, 1, 'percepcao', 60)`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(
        ana,
        (tx) =>
          tx`insert into map_token_reveals (token_id, user_id, campaign_id, roll_total) values (${far}, ${ana}, ${cid}, 60)`,
      ),
    ).rejects.toThrow(/permission denied|row-level security/);
    expect(await sees(ana)).toEqual(['Chave', 'Mesa']);
  });

  it('mapa não compartilhado: nada é revelado', async () => {
    await sql`update maps set shared = false where id = ${mapId}`;
    expect(await reveal(ana, 20, 20, 'percepcao', 60)).toEqual([]);
    expect(await sees(ana)).toEqual([]);
    await sql`update maps set shared = true where id = ${mapId}`;
  });
});
