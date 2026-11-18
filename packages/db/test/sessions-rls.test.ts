/** Sessões ao vivo: só o mestre inicia/encerra/troca a cena; todos da mesa veem. */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, createTestDatabase } from '../src/testing';

let drop: () => Promise<void>;
let sql: postgres.Sql;
let gm: string, pl: string, out: string, cid: string, mapId: string;

async function as<T>(uid: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid })}, true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  }) as Promise<T>;
}

beforeAll(async () => {
  const db = await createTestDatabase('rpg_sess_rls');
  drop = db.drop;
  sql = postgres(db.url, { max: 2, onnotice: () => undefined });
  gm = await createAuthUser(sql, 'gm@s.com');
  pl = await createAuthUser(sql, 'pl@s.com');
  out = await createAuthUser(sql, 'out@s.com');
  const [org] = await sql`select id from organizations where owner_id = ${gm}`;
  const [c] =
    await sql`insert into campaigns (organization_id, created_by, name) values (${org!.id}, ${gm}, 'C') returning id`;
  cid = c!.id;
  await sql`insert into campaign_members (campaign_id, user_id, role) values (${cid}, ${gm}, 'owner'), (${cid}, ${pl}, 'player')`;
  const [m] =
    await sql`insert into maps (campaign_id, created_by, name) values (${cid}, ${gm}, 'Cripta') returning id`;
  mapId = m!.id;
});
afterAll(async () => {
  await sql?.end();
  await drop?.();
});

describe('sessões', () => {
  let sid: string;
  it('jogador não inicia; mestre inicia; só uma ao vivo', async () => {
    await expect(as(pl, (tx) => tx`select app_private.start_session(${cid}, 'x')`)).rejects.toThrow(
      /forbidden/,
    );
    const [r] = await as(gm, (tx) => tx`select app_private.start_session(${cid}, 'O começo') as id`);
    sid = r!.id;
    await expect(as(gm, (tx) => tx`select app_private.start_session(${cid}, 'outra')`)).rejects.toThrow(
      /already live/,
    );
    expect(await as(pl, (tx) => tx`select number, status from sessions`)).toEqual([
      { number: 1, status: 'live' },
    ]);
    expect(await as(out, (tx) => tx`select id from sessions`)).toHaveLength(0);
  });

  it('mensagens e rolagens entram na sessão ao vivo', async () => {
    await as(pl, (tx) => tx`select app_private.post_message(${cid}, 'oi', null, 'public')`);
    await as(pl, (tx) => tx`select app_private.record_roll(${cid}, '1d20', '', '{}', 10, 'public')`);
    const rows = await sql`select session_id from chat_messages`;
    expect(rows.every((r) => r.session_id === sid)).toBe(true);
    const [roll] = await sql`select session_id from dice_rolls`;
    expect(roll!.session_id).toBe(sid);
  });

  it('cena: só o mestre troca, e o mapa passa a ser visível aos jogadores', async () => {
    await expect(as(pl, (tx) => tx`select app_private.set_scene(${sid}, ${mapId})`)).rejects.toThrow(
      /forbidden/,
    );
    expect(await as(pl, (tx) => tx`select id from maps`)).toHaveLength(0);
    await as(gm, (tx) => tx`select app_private.set_scene(${sid}, ${mapId})`);
    expect(await as(pl, (tx) => tx`select id from maps`)).toHaveLength(1);
    const [s] = await sql`select active_map_id from sessions where id = ${sid}`;
    expect(s!.active_map_id).toBe(mapId);
  });

  it('jogador não altera sessão; mestre encerra; depois disso mensagens ficam fora de sessão', async () => {
    await expect(as(pl, (tx) => tx`update sessions set status = 'ended'`)).rejects.toThrow(
      /permission denied/,
    );
    expect(await as(pl, (tx) => tx`update sessions set summary = 'x' returning id`)).toHaveLength(0);
    await expect(as(pl, (tx) => tx`select app_private.end_session(${sid}, '')`)).rejects.toThrow(/forbidden/);
    await as(gm, (tx) => tx`select app_private.end_session(${sid}, 'Grupo entrou na cripta.')`);
    await as(pl, (tx) => tx`select app_private.post_message(${cid}, 'depois', null, 'public')`);
    const [last] = await sql`select session_id from chat_messages order by id desc limit 1`;
    expect(last!.session_id).toBeNull();
    const [r] = await as(gm, (tx) => tx`select app_private.start_session(${cid}, '') as id`);
    const [s2] = await sql`select number from sessions where id = ${r!.id}`;
    expect(s2!.number).toBe(2);
  });
});
