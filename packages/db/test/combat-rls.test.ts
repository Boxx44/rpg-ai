/** Combate: ocultos e PV de inimigos só para o mestre; jogador só mexe no próprio personagem. */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, createTestDatabase } from '../src/testing';

let drop: () => Promise<void>;
let sql: postgres.Sql;
let gm: string, pl: string, pl2: string, out: string, cid: string, eid: string;
let lyra: string, bob: string, ghoul: string, lurker: string;

async function as<T>(uid: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid })}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}

beforeAll(async () => {
  const db = await createTestDatabase('rpg_combat_rls');
  drop = db.drop;
  sql = postgres(db.url, { max: 2, onnotice: () => undefined });
  gm = await createAuthUser(sql, 'gm@c.com');
  pl = await createAuthUser(sql, 'pl@c.com');
  pl2 = await createAuthUser(sql, 'pl2@c.com');
  out = await createAuthUser(sql, 'out@c.com');
  const [org] = await sql`select id from organizations where owner_id = ${gm}`;
  const [c] =
    await sql`insert into campaigns (organization_id, created_by, name) values (${org!.id}, ${gm}, 'C') returning id`;
  cid = c!.id;
  await sql`insert into campaign_members (campaign_id, user_id, role) values (${cid}, ${gm}, 'owner'), (${cid}, ${pl}, 'player'), (${cid}, ${pl2}, 'player')`;
  const [ch1] =
    await sql`insert into characters (campaign_id, owner_id, name) values (${cid}, ${pl}, 'Lyra') returning id`;
  const [ch2] =
    await sql`insert into characters (campaign_id, owner_id, name) values (${cid}, ${pl2}, 'Bob') returning id`;
  const [e] = await as(
    gm,
    (tx) => tx`insert into encounters (campaign_id, started_by) values (${cid}, ${gm}) returning id`,
  );
  eid = e!.id;
  const rows = await as(
    gm,
    (tx) => tx`insert into combatants (encounter_id, campaign_id, kind, character_id, name, hidden) values
    (${eid}, ${cid}, 'character', ${ch1!.id}, 'Lyra', false),
    (${eid}, ${cid}, 'character', ${ch2!.id}, 'Bob', false),
    (${eid}, ${cid}, 'enemy', null, 'Carniçal', false),
    (${eid}, ${cid}, 'enemy', null, 'Espreitador', true) returning id, name`,
  );
  const id = (n: string) => rows.find((r) => r.name === n)!.id as string;
  [lyra, bob, ghoul, lurker] = [id('Lyra'), id('Bob'), id('Carniçal'), id('Espreitador')];
  await as(
    gm,
    (tx) =>
      tx`insert into combatant_gm_details (combatant_id, campaign_id, hp_current, hp_max) values (${ghoul}, ${cid}, 30, 30)`,
  );
});
afterAll(async () => {
  await sql?.end();
  await drop?.();
});

describe('combate', () => {
  it('só um combate ativo por campanha; jogador não cria', async () => {
    await expect(
      as(gm, (tx) => tx`insert into encounters (campaign_id, started_by) values (${cid}, ${gm})`),
    ).rejects.toThrow(/encounters_one_active/);
    await expect(
      as(pl, (tx) => tx`insert into encounters (campaign_id, started_by) values (${cid}, ${pl})`),
    ).rejects.toThrow(/row-level security/);
  });

  it('combatente oculto e PV de inimigos não aparecem para jogadores', async () => {
    expect((await as(pl, (tx) => tx`select name from combatants order by name`)).map((r) => r.name)).toEqual([
      'Bob',
      'Carniçal',
      'Lyra',
    ]);
    expect(await as(gm, (tx) => tx`select id from combatants`)).toHaveLength(4);
    expect(await as(pl, (tx) => tx`select * from combatant_gm_details`)).toHaveLength(0);
    expect(await as(out, (tx) => tx`select id from combatants`)).toHaveLength(0);
    expect(await as(out, (tx) => tx`select id from encounters`)).toHaveLength(0);
  });

  it('jogador não altera combatentes diretamente', async () => {
    const r = await as(pl, (tx) => tx`update combatants set initiative = 99 where id = ${lyra} returning id`);
    expect(r).toHaveLength(0);
    await expect(
      as(pl, (tx) => tx`update combatant_gm_details set hp_current = 0 returning 1`),
    ).resolves.toHaveLength(0);
  });

  it('iniciativa: jogador só no próprio personagem', async () => {
    await as(pl, (tx) => tx`select app_private.set_initiative(${lyra}, 15)`);
    await expect(as(pl, (tx) => tx`select app_private.set_initiative(${bob}, 30)`)).rejects.toThrow(
      /forbidden/,
    );
    await expect(as(pl, (tx) => tx`select app_private.set_initiative(${ghoul}, 30)`)).rejects.toThrow(
      /forbidden/,
    );
    await as(gm, (tx) => tx`select app_private.set_initiative(${bob}, 10)`);
    await as(gm, (tx) => tx`select app_private.set_initiative(${ghoul}, 20)`);
    await as(gm, (tx) => tx`select app_private.set_initiative(${lurker}, 5)`);
    const order = await as(gm, (tx) => tx`select id from app_private.combat_order(${eid}) order by pos`);
    expect(order.map((r) => r.id)).toEqual([ghoul, lyra, bob, lurker]);
  });

  it('turnos: mestre começa; jogador só passa a própria vez; nova rodada ao fim', async () => {
    const cur = async () =>
      (await sql`select current_combatant_id as c, round from encounters where id = ${eid}`)[0]!;
    await expect(as(pl, (tx) => tx`select app_private.advance_turn(${eid}, null)`)).rejects.toThrow(
      /forbidden/,
    );
    await as(gm, (tx) => tx`select app_private.advance_turn(${eid}, null)`);
    expect(await cur()).toEqual({ c: ghoul, round: 1 });
    await as(gm, (tx) => tx`select app_private.advance_turn(${eid}, ${ghoul})`);
    expect((await cur()).c).toBe(lyra);
    await expect(as(pl2, (tx) => tx`select app_private.advance_turn(${eid}, ${lyra})`)).rejects.toThrow(
      /forbidden/,
    );
    await as(pl, (tx) => tx`select app_private.advance_turn(${eid}, ${lyra})`);
    // Clique repetido não passa dois turnos.
    await expect(as(gm, (tx) => tx`select app_private.advance_turn(${eid}, ${lyra})`)).rejects.toThrow(
      /turn changed/,
    );
    await sql`update combatants set defeated = true where id = ${lurker}`;
    await as(pl2, (tx) => tx`select app_private.advance_turn(${eid}, ${bob})`);
    expect(await cur()).toEqual({ c: ghoul, round: 2 });
  });
});
