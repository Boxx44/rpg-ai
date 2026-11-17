/** Segurança da mesa de jogo direto no banco (mesmo sem passar pela API). */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, createTestDatabase } from '../src/testing';

let drop: () => Promise<void>;
let sql: postgres.Sql;
let alice: string, bob: string, carl: string, eve: string;
let cid: string;
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

beforeAll(async () => {
  const db = await createTestDatabase('rpg_game_rls');
  drop = db.drop;
  sql = postgres(db.url, { max: 2, onnotice: () => undefined });
  [alice, bob, carl, eve] = await Promise.all(
    ['alice', 'bob', 'carl', 'eve'].map((n) => createAuthUser(sql, `${n}@example.com`, { display_name: n })),
  );
  const [org] = await sql`select id from organizations where owner_id = ${alice}`;
  const [c] =
    await sql`insert into campaigns (organization_id, created_by, name) values (${org!.id}, ${alice}, 'Mesa') returning id`;
  cid = c!.id;
  await sql`insert into campaign_members (campaign_id, user_id, role) values
    (${cid}, ${alice}, 'owner'), (${cid}, ${bob}, 'player'), (${cid}, ${carl}, 'player')`;
});
afterAll(async () => {
  await sql?.end();
  await drop?.();
});

describe('chat e rolagens', () => {
  it('ninguém insere direto; só pelas funções', async () => {
    await expect(
      as(
        bob,
        (tx) =>
          tx`insert into chat_messages (campaign_id, author_id, kind, content, visibility) values (${cid}, ${bob}, 'text', 'x', 'public')`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(
        bob,
        (tx) =>
          tx`insert into dice_rolls (campaign_id, roller_id, expression, result, total, visibility) values (${cid}, ${bob}, '1d20', '{}', 20, 'public')`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('membro posta; estranho não', async () => {
    await as(bob, (tx) => tx`select app_private.post_message(${cid}, 'olá', null, 'public')`, true);
    await expect(
      as(eve, (tx) => tx`select app_private.post_message(${cid}, 'oi', null, 'public')`),
    ).rejects.toThrow(/forbidden/);
    expect(await as(eve, (tx) => tx`select id from chat_messages`)).toHaveLength(0);
  });

  it('mensagem/rolagem "só para o mestre" fica oculta para outros jogadores', async () => {
    await as(
      bob,
      (tx) => tx`select app_private.record_roll(${cid}, '1d20', 'furtividade', '{}', 17, 'gm')`,
      true,
    );
    const rollsFor = (u: string) => as(u, (tx) => tx`select total from dice_rolls where visibility = 'gm'`);
    expect(await rollsFor(alice)).toHaveLength(1);
    expect(await rollsFor(bob)).toHaveLength(1);
    expect(await rollsFor(carl)).toHaveLength(0);
    expect(await as(carl, (tx) => tx`select id from chat_messages where visibility = 'gm'`)).toHaveLength(0);
  });

  it('chat e rolagens são imutáveis', async () => {
    await expect(sql`update dice_rolls set total = 20`).rejects.toThrow(/append-only/);
  });
});

describe('NPCs', () => {
  let npc: string;
  it('só o mestre cria; detalhes nunca chegam aos jogadores', async () => {
    await expect(
      as(bob, (tx) => tx`insert into npcs (campaign_id, created_by, name) values (${cid}, ${bob}, 'x')`),
    ).rejects.toThrow(/row-level security/);
    npc = await as(
      alice,
      async (tx) => {
        const [n] =
          await tx`insert into npcs (campaign_id, created_by, name) values (${cid}, ${alice}, 'Velho Sábio') returning id`;
        await tx`insert into npc_gm_details (npc_id, campaign_id, secrets) values (${n!.id}, ${cid}, 'é um dragão')`;
        return n!.id as string;
      },
      true,
    );
    expect(await as(bob, (tx) => tx`select id from npcs`)).toHaveLength(0);
    await sql`update npcs set revealed = true where id = ${npc}`;
    expect(await as(bob, (tx) => tx`select name from npcs`)).toHaveLength(1);
    expect(await as(bob, (tx) => tx`select secrets from npc_gm_details`)).toHaveLength(0);
    expect(await as(alice, (tx) => tx`select secrets from npc_gm_details`)).toHaveLength(1);
  });

  it('jogador não fala como NPC', async () => {
    await expect(
      as(bob, (tx) => tx`select app_private.post_message(${cid}, 'sou o sábio', ${npc}, 'public')`),
    ).rejects.toThrow(/forbidden/);
    await as(alice, (tx) => tx`select app_private.post_message(${cid}, 'Bem-vindos', ${npc}, 'public')`);
  });

  it('jogador não altera NPC', async () => {
    const r = await as(bob, (tx) => tx`update npcs set name = 'hack' where id = ${npc} returning id`);
    expect(r).toHaveLength(0);
  });
});

describe('mapas e tokens', () => {
  let map: string, bobToken: string, hiddenToken: string;
  beforeAll(async () => {
    const [m] =
      await sql`insert into maps (campaign_id, created_by, name, cols, rows) values (${cid}, ${alice}, 'Caverna', 10, 10) returning id`;
    map = m!.id;
    const [t1] =
      await sql`insert into map_tokens (map_id, campaign_id, kind, label, x, y, controlled_by) values (${map}, ${cid}, 'character', 'Bob', 1, 1, ${bob}) returning id`;
    const [t2] =
      await sql`insert into map_tokens (map_id, campaign_id, kind, label, x, y, hidden) values (${map}, ${cid}, 'enemy', 'Emboscada', 5, 5, true) returning id`;
    bobToken = t1!.id;
    hiddenToken = t2!.id;
  });

  it('mapa não compartilhado é invisível ao jogador', async () => {
    expect(await as(bob, (tx) => tx`select id from maps`)).toHaveLength(0);
    expect(await as(bob, (tx) => tx`select id from map_tokens`)).toHaveLength(0);
    await sql`update maps set shared = true where id = ${map}`;
    expect(await as(bob, (tx) => tx`select id from maps`)).toHaveLength(1);
  });

  it('token oculto só o mestre vê', async () => {
    const bobSees = await as(bob, (tx) => tx`select id from map_tokens`);
    expect(bobSees.map((r) => r.id)).toEqual([bobToken]);
    expect(await as(alice, (tx) => tx`select id from map_tokens`)).toHaveLength(2);
  });

  it('jogador move só o próprio token e dentro do mapa', async () => {
    const [ok] = await as(bob, (tx) => tx`select app_private.move_token(${bobToken}, 3, 4) as ok`);
    expect(ok!.ok).toBe(true);
    const [no] = await as(carl, (tx) => tx`select app_private.move_token(${bobToken}, 3, 4) as ok`);
    expect(no!.ok).toBe(false);
    const [hid] = await as(bob, (tx) => tx`select app_private.move_token(${hiddenToken}, 0, 0) as ok`);
    expect(hid!.ok).toBe(false);
    await expect(as(bob, (tx) => tx`select app_private.move_token(${bobToken}, 10, 0)`)).rejects.toThrow(
      /out of bounds/,
    );
    await expect(as(bob, (tx) => tx`update map_tokens set x = 0 where id = ${bobToken}`)).rejects.toThrow(
      /permission denied/,
    );
  });

  it('jogador não cria mapas nem tokens', async () => {
    await expect(
      as(bob, (tx) => tx`insert into maps (campaign_id, created_by, name) values (${cid}, ${bob}, 'x')`),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(
        bob,
        (tx) =>
          tx`insert into map_tokens (map_id, campaign_id, kind, label, x, y) values (${map}, ${cid}, 'object', 'x', 0, 0)`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('personagens', () => {
  let bobChar: string;
  it('jogador cria o próprio; todos da mesa veem; estranho não', async () => {
    bobChar = await as(
      bob,
      async (tx) =>
        (
          await tx`insert into characters (campaign_id, owner_id, name) values (${cid}, ${bob}, 'Thorin') returning id`
        )[0]!.id,
      true,
    );
    expect(await as(carl, (tx) => tx`select id from characters`)).toHaveLength(1);
    expect(await as(eve, (tx) => tx`select id from characters`)).toHaveLength(0);
    await expect(
      as(
        bob,
        (tx) => tx`insert into characters (campaign_id, owner_id, name) values (${cid}, ${carl}, 'falso')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('outro jogador não edita; mestre edita; ninguém troca de campanha', async () => {
    expect(
      await as(carl, (tx) => tx`update characters set name = 'x' where id = ${bobChar} returning id`),
    ).toHaveLength(0);
    expect(
      await as(
        alice,
        (tx) => tx`update characters set name = 'Thorin II' where id = ${bobChar} returning id`,
      ),
    ).toHaveLength(1);
    await expect(
      as(bob, (tx) => tx`update characters set campaign_id = ${cid} where id = ${bobChar}`),
    ).rejects.toThrow(/permission denied/);
  });

  it('ficha precisa ser objeto JSON', async () => {
    await expect(
      sql`insert into characters (campaign_id, owner_id, name, sheet) values (${cid}, ${bob}, 'x', '[1]')`,
    ).rejects.toThrow(/check constraint/);
  });
});
