import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeUser, setupApp, type TestCtx } from './helpers';

let t: TestCtx;
type U = Awaited<ReturnType<typeof makeUser>>;
let gm: U, pl: U, cid: string, mid: string;
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });

beforeAll(async () => {
  t = await setupApp();
  gm = await makeUser(t, 'gm@pr.com', 'GM');
  pl = await makeUser(t, 'pl@pr.com', 'PL');
  cid = (await request(t.http).post('/campaigns').set(auth(gm)).send({ name: 'Casa' }).expect(201)).body.id;
  const inv = await request(t.http).post(`/campaigns/${cid}/invitations`).set(auth(gm)).send({}).expect(201);
  await request(t.http).post(`/invitations/${inv.body.token}/accept`).set(auth(pl)).expect(200);
  mid = (
    await request(t.http)
      .post(`/campaigns/${cid}/maps`)
      .set(auth(gm))
      .send({ name: 'Sala', cols: 8, rows: 8 })
      .expect(201)
  ).body.id;
});
afterAll(async () => {
  await t?.teardown();
});

describe('objetos do mapa', () => {
  it('porta nasce fechada; jogador abre e fecha num mapa compartilhado', async () => {
    const base = `/campaigns/${cid}/maps/${mid}/tokens`;
    await request(t.http)
      .post(base)
      .set(auth(gm))
      .send({ kind: 'npc', label: 'X', x: 0, y: 0, icon: 'door' })
      .expect(400);
    const door = (
      await request(t.http)
        .post(base)
        .set(auth(gm))
        .send({ kind: 'object', label: 'Porta', x: 2, y: 2, icon: 'door', rotation: 90 })
        .expect(201)
    ).body;
    expect(door).toMatchObject({ icon: 'door', state: 'closed', rotation: 90 });
    const crate = (
      await request(t.http)
        .post(base)
        .set(auth(gm))
        .send({ kind: 'object', label: 'Caixa', x: 3, y: 3, icon: 'crate' })
        .expect(201)
    ).body;
    expect(crate.state).toBeNull();
    // Mapa ainda não compartilhado: para o jogador, nem existe.
    await request(t.http).post(`${base}/${door.id}/toggle`).set(auth(pl)).expect(404);
    await request(t.http)
      .patch(`/campaigns/${cid}/maps/${mid}`)
      .set(auth(gm))
      .send({ shared: true })
      .expect(200);
    expect((await request(t.http).post(`${base}/${door.id}/toggle`).set(auth(pl)).expect(200)).body).toEqual({
      state: 'open',
    });
    expect((await request(t.http).post(`${base}/${door.id}/toggle`).set(auth(gm)).expect(200)).body).toEqual({
      state: 'closed',
    });
    // Objeto sem estado não é "usável"; objeto oculto não existe para o jogador.
    await request(t.http).post(`${base}/${crate.id}/toggle`).set(auth(gm)).expect(404);
    const torch = (
      await request(t.http)
        .post(base)
        .set(auth(gm))
        .send({ kind: 'object', label: 'Tocha', x: 4, y: 4, icon: 'torch', hidden: true })
        .expect(201)
    ).body;
    expect(torch.state).toBe('on');
    await request(t.http).post(`${base}/${torch.id}/toggle`).set(auth(pl)).expect(404);
    const map = await request(t.http).get(`/campaigns/${cid}/maps/${mid}`).set(auth(pl)).expect(200);
    expect(map.body.tokens.map((x: { label: string }) => x.label).sort()).toEqual(['Caixa', 'Porta']);
  });
});
