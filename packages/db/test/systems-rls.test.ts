/** Livros e sistemas: privados à organização e aos jogadores das campanhas que os usam. */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, createTestDatabase } from '../src/testing';

let drop: () => Promise<void>;
let sql: postgres.Sql;
let gm: string, player: string, other: string;
let sys: string, ver: string, cid: string, otherCid: string;
class Rollback extends Error {}

async function as<T>(uid: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let out!: T;
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid })}, true)`;
      await tx`set local role authenticated`;
      out = await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  return out;
}

beforeAll(async () => {
  const db = await createTestDatabase('rpg_sys_rls');
  drop = db.drop;
  sql = postgres(db.url, { max: 2, onnotice: () => undefined });
  gm = await createAuthUser(sql, 'gm@x.com');
  player = await createAuthUser(sql, 'pl@x.com');
  other = await createAuthUser(sql, 'ot@x.com');
  const [org] = await sql`select id from organizations where owner_id = ${gm}`;
  const [s] =
    await sql`insert into rpg_systems (organization_id, created_by, name) values (${org!.id}, ${gm}, 'Ordem') returning id`;
  sys = s!.id;
  const [v] =
    await sql`insert into system_versions (system_id, version, definition, created_by) values (${sys}, 1, '{}', ${gm}) returning id`;
  ver = v!.id;
  const [d] =
    await sql`insert into documents (system_id, uploaded_by, filename, storage_key, sha256, size_bytes)
    values (${sys}, ${gm}, 'livro.pdf', 'k', ${'a'.repeat(64)}, 10) returning id`;
  await sql`insert into document_pages (document_id, system_id, page_number, text) values (${d!.id}, ${sys}, 51, 'Furtividade é uma perícia de Agilidade')`;
  const [c] =
    await sql`insert into campaigns (organization_id, created_by, name) values (${org!.id}, ${gm}, 'C') returning id`;
  cid = c!.id;
  await sql`insert into campaign_members (campaign_id, user_id, role) values (${cid}, ${gm}, 'owner'), (${cid}, ${player}, 'player')`;
  const [org2] = await sql`select id from organizations where owner_id = ${other}`;
  const [c2] =
    await sql`insert into campaigns (organization_id, created_by, name) values (${org2!.id}, ${other}, 'X') returning id`;
  otherCid = c2!.id;
  await sql`insert into campaign_members (campaign_id, user_id, role) values (${otherCid}, ${other}, 'owner')`;
});
afterAll(async () => {
  await sql?.end();
  await drop?.();
});

describe('sistemas e livros', () => {
  it('jogador só lê o livro depois que a campanha usa o sistema', async () => {
    expect(await as(player, (tx) => tx`select id from document_pages`)).toHaveLength(0);
    await as(gm, async (tx) => {
      await tx`select app_private.set_campaign_system(${cid}, ${ver})`;
    });
    await sql`update campaigns set system_version_id = ${ver} where id = ${cid}`;
    expect(await as(player, (tx) => tx`select id from document_pages`)).toHaveLength(1);
    expect(await as(other, (tx) => tx`select id from document_pages`)).toHaveLength(0);
    expect(await as(other, (tx) => tx`select id from rpg_systems`)).toHaveLength(0);
  });

  it('busca em português ignora acentos', async () => {
    const r = await as(
      player,
      (tx) => tx`select page_number from document_pages
      where tsv @@ websearch_to_tsquery('portuguese', app_private.unaccent_i('pericia agilidade'))`,
    );
    expect(r[0]!.page_number).toBe(51);
  });

  it('jogador não altera sistema, livro nem páginas', async () => {
    expect(await as(player, (tx) => tx`update rpg_systems set name = 'x' returning id`)).toHaveLength(0);
    await expect(
      as(
        player,
        (tx) =>
          tx`insert into document_pages (document_id, system_id, page_number, text) select document_id, system_id, 2, 'x' from document_pages limit 1`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(as(gm, (tx) => tx`update documents set status = 'ready'`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it('versão publicada é imutável', async () => {
    await expect(sql`update system_versions set definition = '{"a":1}' where id = ${ver}`).rejects.toThrow(
      /append-only/,
    );
  });

  it('não dá para ligar campanha a sistema de outra organização nem trocar direto', async () => {
    await expect(
      as(other, (tx) => tx`select app_private.set_campaign_system(${otherCid}, ${ver})`),
    ).rejects.toThrow(/forbidden/);
    await expect(
      as(player, (tx) => tx`select app_private.set_campaign_system(${cid}, null)`),
    ).rejects.toThrow(/forbidden/);
    await expect(
      as(gm, (tx) => tx`update campaigns set system_version_id = null where id = ${cid}`),
    ).rejects.toThrow(/permission denied/);
  });
});
