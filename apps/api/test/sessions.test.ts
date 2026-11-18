import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeUser, setupApp, type TestCtx } from './helpers';

let t: TestCtx;
let port: number;
type U = Awaited<ReturnType<typeof makeUser>>;
let gm: U, pl: U, out: U, cid: string, sid: string, mapId: string;
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });
const sockets: Socket[] = [];
const settle = () => new Promise((r) => setTimeout(r, 150));

/** Conectado ao site, mas SEM entrar na mesa (recebe só a sala pessoal). */
async function connected(u: U, joinCampaign = false) {
  const events: { event: string; payload: unknown }[] = [];
  const s = io(`http://localhost:${port}/realtime`, { auth: { token: u.token }, transports: ['websocket'] });
  sockets.push(s);
  await new Promise<void>((res) => s.once('session.ready', () => res()));
  if (joinCampaign) await s.emitWithAck('campaign.join', { campaignId: cid });
  s.onAny((event, payload) => events.push({ event, payload }));
  return events;
}

beforeAll(async () => {
  t = await setupApp();
  await t.created.app.listen(0);
  port = (t.http.address() as { port: number }).port;
  gm = await makeUser(t, 'gm@ss.com', 'GM');
  pl = await makeUser(t, 'pl@ss.com', 'PL');
  out = await makeUser(t, 'out@ss.com', 'OUT');
  cid = (await request(t.http).post('/campaigns').set(auth(gm)).send({ name: 'A Cripta' }).expect(201)).body.id;
  const inv = await request(t.http).post(`/campaigns/${cid}/invitations`).set(auth(gm)).send({}).expect(201);
  await request(t.http).post(`/invitations/${inv.body.token}/accept`).set(auth(pl)).expect(200);
  mapId = (await request(t.http).post(`/campaigns/${cid}/maps`).set(auth(gm)).send({ name: 'Salão' }).expect(201)).body.id;
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await t?.teardown();
});

describe('sessões ao vivo', () => {
  it('jogador não inicia; mestre inicia e todos os membros são avisados onde estiverem', async () => {
    const plEvents = await connected(pl);
    const outEvents = await connected(out);
    await request(t.http).post(`/campaigns/${cid}/sessions`).set(auth(pl)).send({}).expect(403);
    const r = await request(t.http).post(`/campaigns/${cid}/sessions`).set(auth(gm)).send({ title: 'O despertar' }).expect(201);
    sid = r.body.id;
    expect(r.body).toMatchObject({ number: 1, status: 'live', title: 'O despertar' });
    await settle();
    const ev = plEvents.find((e) => e.event === 'session.started')?.payload as { campaignName: string };
    expect(ev?.campaignName).toBe('A Cripta');
    expect(outEvents.some((e) => e.event === 'session.started')).toBe(false);
    await request(t.http).post(`/campaigns/${cid}/sessions`).set(auth(gm)).send({}).expect(409);
  });

  it('campanha mostra a sessão ao vivo no painel', async () => {
    const list = await request(t.http).get('/campaigns').set(auth(pl)).expect(200);
    expect(list.body[0].liveSession).toMatchObject({ id: sid, number: 1, title: 'O despertar' });
    const live = await request(t.http).get(`/campaigns/${cid}/sessions/live`).set(auth(pl)).expect(200);
    expect(live.body.id).toBe(sid);
    await request(t.http).get(`/campaigns/${cid}/sessions/live`).set(auth(out)).expect(404);
  });

  it('mestre troca a cena: o mapa aparece para os jogadores na hora', async () => {
    const plEvents = await connected(pl, true);
    expect((await request(t.http).get(`/campaigns/${cid}/maps`).set(auth(pl)).expect(200)).body).toHaveLength(0);
    await request(t.http).post(`/campaigns/${cid}/sessions/${sid}/scene`).set(auth(pl)).send({ mapId }).expect(403);
    const r = await request(t.http).post(`/campaigns/${cid}/sessions/${sid}/scene`).set(auth(gm)).send({ mapId }).expect(200);
    expect(r.body.activeMapId).toBe(mapId);
    await settle();
    expect(plEvents.find((e) => e.event === 'scene.changed')?.payload).toEqual({ sessionId: sid, mapId });
    expect((await request(t.http).get(`/campaigns/${cid}/maps`).set(auth(pl)).expect(200)).body).toHaveLength(1);
    await request(t.http)
      .post(`/campaigns/${cid}/sessions/${sid}/scene`)
      .set(auth(gm))
      .send({ mapId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
  });

  it('mensagens da sessão ficam ligadas a ela; encerrar guarda o resumo', async () => {
    const m = await request(t.http).post(`/campaigns/${cid}/messages`).set(auth(pl)).send({ content: 'Entramos!' }).expect(201);
    expect(m.body.sessionId).toBe(sid);
    const plEvents = await connected(pl, true);
    await request(t.http).post(`/campaigns/${cid}/sessions/${sid}/end`).set(auth(pl)).send({}).expect(403);
    const e = await request(t.http).post(`/campaigns/${cid}/sessions/${sid}/end`).set(auth(gm)).send({ summary: 'O grupo achou a cripta.' }).expect(200);
    expect(e.body).toMatchObject({ status: 'ended', summary: 'O grupo achou a cripta.', messageCount: 1 });
    await settle();
    expect(plEvents.some((x) => x.event === 'session.ended')).toBe(true);
    const hist = await request(t.http).get(`/campaigns/${cid}/messages`).query({ session: sid }).set(auth(pl)).expect(200);
    expect(hist.body.map((x: { content: string }) => x.content)).toEqual(['Entramos!']);
    const after = await request(t.http).post(`/campaigns/${cid}/messages`).set(auth(pl)).send({ content: 'fora' }).expect(201);
    expect(after.body.sessionId).toBeNull();
    await request(t.http).post(`/campaigns/${cid}/sessions/${sid}/end`).set(auth(gm)).send({}).expect(404);
  });

  it('histórico de sessões e próxima sessão numerada', async () => {
    await request(t.http).post(`/campaigns/${cid}/sessions`).set(auth(gm)).send({ title: 'Parte 2' }).expect(201);
    const list = await request(t.http).get(`/campaigns/${cid}/sessions`).set(auth(pl)).expect(200);
    expect(list.body.map((x: { number: number; status: string }) => [x.number, x.status])).toEqual([
      [2, 'live'],
      [1, 'ended'],
    ]);
    await request(t.http).patch(`/campaigns/${cid}/sessions/${sid}`).set(auth(gm)).send({ summary: 'Revisado' }).expect(200);
    await request(t.http).patch(`/campaigns/${cid}/sessions/${sid}`).set(auth(pl)).send({ summary: 'x' }).expect(403);
  });
});
