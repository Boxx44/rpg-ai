/** Imagens: quem vê o quê, direto no banco (mesmo sem passar pela API). */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, createTestDatabase } from '../src/testing';

let drop: () => Promise<void>;
let sql: postgres.Sql;
let gm: string, bob: string, carl: string, eve: string;
let cid: string, other: string, mapId: string, charId: string;
class Rollback extends Error {}

async function as<T>(
  uid: string,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
  commit = false,
): Promise<T> {
  let out!: T;
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: 'authenticated' })}, true)`;
      await tx`set local role authenticated`;
      out = await fn(tx);
      if (!commit) throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out;
}

const png = Buffer.from('89504e470d0a1a0a0000', 'hex');
async function upload(uid: string, campaign: string, kind: string, bytes = png) {
  const [r] = await as(
    uid,
    (tx) =>
      tx`insert into assets (campaign_id, owner_id, kind, mime, width, height, bytes, data)
         values (${campaign}, ${uid}, ${kind}, 'image/png', 10, 10, ${bytes.length}, ${bytes}) returning id`,
    true,
  );
  return r!.id as string;
}
const visible = (uid: string, id: string) =>
  as(uid, async (tx) => (await tx`select id from assets where id = ${id}`).length === 1);

beforeAll(async () => {
  const db = await createTestDatabase('rpg_assets_rls');
  drop = db.drop;
  sql = postgres(db.url, { max: 2, onnotice: () => undefined });
  [gm, bob, carl, eve] = await Promise.all(
    ['gm', 'bob', 'carl', 'eve'].map((n) => createAuthUser(sql, `${n}@example.com`, { display_name: n })),
  );
  const [org] = await sql`select id from organizations where owner_id = ${gm}`;
  const [c] =
    await sql`insert into campaigns (organization_id, created_by, name) values (${org!.id}, ${gm}, 'Mesa') returning id`;
  cid = c!.id;
  const [o] =
    await sql`insert into campaigns (organization_id, created_by, name) values (${org!.id}, ${gm}, 'Outra') returning id`;
  other = o!.id;
  await sql`insert into campaign_members (campaign_id, user_id, role) values
    (${cid}, ${gm}, 'owner'), (${cid}, ${bob}, 'player'), (${cid}, ${carl}, 'player'),
    (${other}, ${gm}, 'owner'), (${other}, ${eve}, 'player')`;
  const [m] =
    await sql`insert into maps (campaign_id, created_by, name) values (${cid}, ${gm}, 'Porão') returning id`;
  mapId = m!.id;
  const [ch] =
    await sql`insert into characters (campaign_id, owner_id, name) values (${cid}, ${bob}, 'Rui') returning id`;
  charId = ch!.id;
});
afterAll(async () => {
  await sql?.end();
  await drop?.();
});

describe('imagens', () => {
  it('fundo de mapa: só o mestre vê até o mapa ser compartilhado', async () => {
    const bg = await upload(gm, cid, 'map');
    await as(gm, (tx) => tx`update maps set background_asset = ${bg} where id = ${mapId}`, true);
    expect(await visible(gm, bg)).toBe(true);
    expect(await visible(bob, bg)).toBe(false);
    await sql`update maps set shared = true where id = ${mapId}`;
    expect(await visible(bob, bg)).toBe(true);
    expect(await visible(eve, bg)).toBe(false); // de fora da campanha
    await sql`update maps set shared = false where id = ${mapId}`;
  });

  it('token oculto esconde a imagem', async () => {
    await sql`update maps set shared = true where id = ${mapId}`;
    const img = await upload(gm, cid, 'token');
    const [t] = await sql`insert into map_tokens (map_id, campaign_id, kind, label, x, y, hidden)
      values (${mapId}, ${cid}, 'enemy', 'Zumbi', 1, 1, true) returning id`;
    await as(gm, (tx) => tx`update map_tokens set image_asset = ${img} where id = ${t!.id}`, true);
    expect(await visible(bob, img)).toBe(false);
    await sql`update map_tokens set hidden = false where id = ${t!.id}`;
    expect(await visible(bob, img)).toBe(true);
  });

  it('jogador envia retrato do próprio personagem; todos da mesa veem', async () => {
    const p = await upload(bob, cid, 'portrait');
    await as(bob, (tx) => tx`update characters set portrait_asset = ${p} where id = ${charId}`, true);
    expect(await visible(carl, p)).toBe(true);
    expect(await visible(eve, p)).toBe(false);
  });

  it('jogador não envia fundo de mapa nem imagem de token', async () => {
    await expect(upload(bob, cid, 'map')).rejects.toThrow(/row-level security/);
    await expect(upload(bob, cid, 'token')).rejects.toThrow(/row-level security/);
  });

  it('jogador não pendura imagem secreta do mestre no próprio retrato', async () => {
    const secret = await upload(gm, cid, 'map');
    await expect(
      as(bob, (tx) => tx`update characters set portrait_asset = ${secret} where id = ${charId}`),
    ).rejects.toThrow(/outra pessoa/);
    expect(await visible(bob, secret)).toBe(false);
  });

  it('não usa imagem de outra campanha', async () => {
    const foreign = await upload(gm, other, 'map');
    await expect(
      as(gm, (tx) => tx`update maps set background_asset = ${foreign} where id = ${mapId}`),
    ).rejects.toThrow(/imagem inválida/);
  });

  it('limite de espaço por campanha', async () => {
    await sql`insert into assets (campaign_id, owner_id, kind, mime, width, height, bytes, data)
      values (${cid}, ${gm}, 'map', 'image/png', 1, 1, 4000000, decode(repeat('00', 4000000), 'hex'))`;
    // força o uso perto do limite sem gravar 60 MB de verdade
    await sql`alter table assets drop constraint if exists assets_check`;
    await sql`alter table assets drop constraint if exists assets_bytes_check`;
    await sql`update assets set bytes = 62914000 where octet_length(data) = 4000000`;
    await expect(upload(gm, cid, 'map', Buffer.alloc(1000, 1))).rejects.toThrow(/row-level security/);
    // outra campanha não é afetada
    await expect(upload(gm, other, 'map')).resolves.toBeTruthy();
  });
});
