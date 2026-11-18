import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeUser, setupApp, type TestCtx } from './helpers';

let t: TestCtx;
let port: number;
type U = Awaited<ReturnType<typeof makeUser>>;
let gm: U, pl: U, out: U, cid: string;
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });
const sockets: Socket[] = [];
const settle = () => new Promise((r) => setTimeout(r, 150));
const base = () => `/campaigns/${cid}/combat`;
type C = {
  id: string;
  name: string;
  hp: { current: number; max: number } | null;
  health: string;
  initiative: number | null;
  mine: boolean;
  conditions: string[];
};
const find = (body: { combatants: C[] }, name: string) => body.combatants.find((c) => c.name === name)!;

beforeAll(async () => {
  t = await setupApp();
  await t.created.app.listen(0);
  port = (t.http.address() as { port: number }).port;
  gm = await makeUser(t, 'gm@cb.com', 'GM');
  pl = await makeUser(t, 'pl@cb.com', 'PL');
  out = await makeUser(t, 'out@cb.com', 'OUT');
  cid = (await request(t.http).post('/campaigns').set(auth(gm)).send({ name: 'Ruínas' }).expect(201)).body.id;
  const inv = await request(t.http).post(`/campaigns/${cid}/invitations`).set(auth(gm)).send({}).expect(201);
  await request(t.http).post(`/invitations/${inv.body.token}/accept`).set(auth(pl)).expect(200);
  const sys = await request(t.http)
    .post('/systems')
    .set(auth(gm))
    .send({ templateId: 'ordem_paranormal' })
    .expect(201);
  await request(t.http)
    .post(`/campaigns/${cid}/system`)
    .set(auth(gm))
    .send({ systemId: sys.body.id })
    .expect(200);
  await request(t.http)
    .post(`/campaigns/${cid}/characters`)
    .set(auth(pl))
    .send({
      name: 'Arthur',
      sheet: {
        system: {
          attributes: { AGI: 3, FOR: 0, INT: 2, PRE: 1, VIG: 2 },
          fields: { classe: 'especialista', nex: '5', origem: 'criminoso' },
          skills: { iniciativa: 'treinado' },
        },
      },
    })
    .expect(201);
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await t?.teardown();
});

describe('combate', () => {
  it('só o mestre inicia; personagens entram sozinhos; um combate por vez', async () => {
    await request(t.http).post(base()).set(auth(pl)).send({}).expect(403);
    const r = await request(t.http).post(base()).set(auth(gm)).send({}).expect(201);
    expect(r.body.round).toBe(1);
    expect(find(r.body, 'Arthur')).toMatchObject({ hp: { current: 18, max: 18 }, health: 'ok' });
    await request(t.http).post(base()).set(auth(gm)).send({}).expect(409);
    await request(t.http).get(base()).set(auth(out)).expect(404);
  });

  it('inimigos: PV só para o mestre; ocultos não aparecem para jogadores', async () => {
    await request(t.http)
      .post(`${base()}/combatants`)
      .set(auth(pl))
      .send({ kind: 'enemy', name: 'X' })
      .expect(403);
    await request(t.http)
      .post(`${base()}/combatants`)
      .set(auth(gm))
      .send({ kind: 'enemy', name: 'Zumbi', hp: 20, count: 2 })
      .expect(201);
    const r = await request(t.http)
      .post(`${base()}/combatants`)
      .set(auth(gm))
      .send({ kind: 'enemy', name: 'Vulto', hp: 40, hidden: true })
      .expect(201);
    expect(r.body.combatants).toHaveLength(4);
    expect(find(r.body, 'Zumbi 1').hp).toEqual({ current: 20, max: 20 });
    const p = await request(t.http).get(base()).set(auth(pl)).expect(200);
    expect(p.body.combatants.map((c: C) => c.name).sort()).toEqual(['Arthur', 'Zumbi 1', 'Zumbi 2']);
    expect(find(p.body, 'Zumbi 1').hp).toBeNull();
    expect(find(p.body, 'Arthur').mine).toBe(true);
    expect(find(p.body, 'Zumbi 1').mine).toBe(false);
  });

  it('Iniciativa é rolada no servidor pela regra do livro e avisa a mesa', async () => {
    const events: string[] = [];
    const s = io(`http://localhost:${port}/realtime`, {
      auth: { token: pl.token },
      transports: ['websocket'],
    });
    sockets.push(s);
    await new Promise<void>((res) => s.once('session.ready', () => res()));
    await s.emitWithAck('campaign.join', { campaignId: cid });
    s.onAny((e) => events.push(e));
    const view = (await request(t.http).get(base()).set(auth(pl))).body;
    const arthur = find(view, 'Arthur');
    const zumbi = find(view, 'Zumbi 1');
    await request(t.http)
      .post(`${base()}/combatants/${zumbi.id}/initiative`)
      .set(auth(pl))
      .send({})
      .expect(403);
    const r = await request(t.http)
      .post(`${base()}/combatants/${arthur.id}/initiative`)
      .set(auth(pl))
      .send({})
      .expect(200);
    const ini = find(r.body, 'Arthur').initiative!;
    expect(ini).toBeGreaterThanOrEqual(6);
    expect(ini).toBeLessThanOrEqual(25);
    const msgs = await request(t.http).get(`/campaigns/${cid}/messages`).set(auth(pl)).expect(200);
    const roll = msgs.body.at(-1).roll;
    expect(roll).toMatchObject({ expression: '3d20kh1+5', label: 'Arthur: Iniciativa', total: ini });
    await settle();
    expect(events).toContain('combat.changed');
    // Rolagem de inimigo fica só para o mestre na crônica.
    await request(t.http)
      .post(`${base()}/combatants/${zumbi.id}/initiative`)
      .set(auth(gm))
      .send({ bonus: 2 })
      .expect(200);
    const after = await request(t.http).get(`/campaigns/${cid}/messages`).set(auth(pl)).expect(200);
    expect(after.body.at(-1).roll.label).toBe('Arthur: Iniciativa');
  });

  it('dano no personagem altera a ficha; dano no inimigo mostra só o estado ao jogador', async () => {
    const v = (await request(t.http).get(base()).set(auth(gm))).body;
    const arthur = find(v, 'Arthur');
    const zumbi = find(v, 'Zumbi 1');
    await request(t.http)
      .post(`${base()}/combatants/${zumbi.id}/hp`)
      .set(auth(pl))
      .send({ delta: -5 })
      .expect(403);
    const r = await request(t.http)
      .post(`${base()}/combatants/${arthur.id}/hp`)
      .set(auth(pl))
      .send({ delta: -10 })
      .expect(200);
    expect(find(r.body, 'Arthur')).toMatchObject({ hp: { current: 8, max: 18 }, health: 'hurt' });
    const ch = await request(t.http).get(`/campaigns/${cid}/characters`).set(auth(pl)).expect(200);
    expect(ch.body[0].sheet.system.current.pv).toBe(8);
    await request(t.http)
      .post(`${base()}/combatants/${arthur.id}/hp`)
      .set(auth(gm))
      .send({ delta: 100 })
      .expect(200);
    await request(t.http)
      .post(`${base()}/combatants/${zumbi.id}/hp`)
      .set(auth(gm))
      .send({ delta: -25 })
      .expect(200);
    const p = (await request(t.http).get(base()).set(auth(pl))).body;
    expect(find(p, 'Arthur').hp).toEqual({ current: 18, max: 18 });
    expect(find(p, 'Zumbi 1')).toMatchObject({ health: 'down', hp: null });
  });

  it('condições do livro; turnos e rodadas', async () => {
    const v = (await request(t.http).get(base()).set(auth(gm))).body;
    const arthur = find(v, 'Arthur');
    await request(t.http)
      .patch(`${base()}/combatants/${arthur.id}`)
      .set(auth(gm))
      .send({ conditions: ['inventada'] })
      .expect(400);
    const c = await request(t.http)
      .patch(`${base()}/combatants/${arthur.id}`)
      .set(auth(gm))
      .send({ conditions: ['caido', 'abalado', 'caido'] })
      .expect(200);
    expect(find(c.body, 'Arthur').conditions).toEqual(['caido', 'abalado']);
    await request(t.http)
      .patch(`${base()}/combatants/${arthur.id}`)
      .set(auth(pl))
      .send({ conditions: [] })
      .expect(403);

    let cur = (
      await request(t.http).post(`${base()}/next`).set(auth(gm)).send({ expected: null }).expect(200)
    ).body;
    const seen = new Set<string>();
    for (let i = 0; i < 8 && cur.round === 1; i++) {
      if (cur.currentId) seen.add(cur.currentId);
      cur = (
        await request(t.http)
          .post(`${base()}/next`)
          .set(auth(gm))
          .send({
            expected: cur.currentId ?? (await request(t.http).get(base()).set(auth(gm))).body.currentId,
          })
          .expect(200)
      ).body;
    }
    expect(cur.round).toBe(2);
    await request(t.http).post(`${base()}/next`).set(auth(gm)).send({ expected: null }).expect(409);
  });

  it('mestre encerra o combate', async () => {
    await request(t.http).post(`${base()}/end`).set(auth(pl)).expect(403);
    await request(t.http).post(`${base()}/end`).set(auth(gm)).expect(200);
    expect((await request(t.http).get(base()).set(auth(pl)).expect(200)).body).toEqual({});
  });
});
