import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeUser, setupApp, type TestCtx } from './helpers';

let t: TestCtx;
let port: number;
type U = Awaited<ReturnType<typeof makeUser>>;
let gm: U, p1: U, p2: U, spec: U, out: U;
let cid: string;
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });
const sockets: Socket[] = [];

/** Conecta um usuário ao tempo real, entra na campanha e grava os eventos recebidos. */
async function listen(u: U) {
  const events: { event: string; payload: unknown }[] = [];
  const s = io(`http://localhost:${port}/realtime`, { auth: { token: u.token }, transports: ['websocket'] });
  sockets.push(s);
  await new Promise<void>((res) => s.once('session.ready', () => res()));
  const ack = await s.emitWithAck('campaign.join', { campaignId: cid });
  s.onAny((event, payload) => events.push({ event, payload }));
  return { s, events, ack };
}
const settle = () => new Promise((r) => setTimeout(r, 150));

beforeAll(async () => {
  t = await setupApp();
  await t.created.app.listen(0);
  port = (t.http.address() as { port: number }).port;
  gm = await makeUser(t, 'gm@ex.com', 'GM');
  p1 = await makeUser(t, 'p1@ex.com', 'P1');
  p2 = await makeUser(t, 'p2@ex.com', 'P2');
  spec = await makeUser(t, 'spec@ex.com', 'SPEC');
  out = await makeUser(t, 'out@ex.com', 'OUT');
  const c = await request(t.http).post('/campaigns').set(auth(gm)).send({ name: 'Mesa' }).expect(201);
  cid = c.body.id;
  for (const [u, role] of [
    [p1, 'player'],
    [p2, 'player'],
    [spec, 'spectator'],
  ] as const) {
    const inv = await request(t.http)
      .post(`/campaigns/${cid}/invitations`)
      .set(auth(gm))
      .send({ role })
      .expect(201);
    await request(t.http).post(`/invitations/${inv.body.token}/accept`).set(auth(u)).expect(200);
  }
});
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await t?.teardown();
});

describe('tempo real: entrar na campanha', () => {
  it('membro entra; estranho é recusado', async () => {
    expect((await listen(p1)).ack).toEqual({ ok: true, role: 'player' });
    expect((await listen(out)).ack).toEqual({ ok: false });
  });
});

describe('rolagens', () => {
  it('rola no servidor, registra e transmite', async () => {
    const l2 = await listen(p2);
    const r = await request(t.http)
      .post(`/campaigns/${cid}/rolls`)
      .set(auth(p1))
      .send({ expression: '2d6+3', label: 'Ataque' })
      .expect(201);
    expect(r.body.roll.expression).toBe('2d6+3');
    expect(r.body.roll.total).toBeGreaterThanOrEqual(5);
    expect(r.body.roll.total).toBeLessThanOrEqual(15);
    expect(r.body.author.displayName).toBe('P1');
    await settle();
    expect(l2.events.find((e) => e.event === 'chat.message')).toBeTruthy();
  });

  it('expressão inválida → 400 com explicação', async () => {
    const r = await request(t.http)
      .post(`/campaigns/${cid}/rolls`)
      .set(auth(p1))
      .send({ expression: '1d6;drop' })
      .expect(400);
    expect(r.body.error.message).toMatch(/inválida/);
  });

  it('espectador não rola; estranho não acessa', async () => {
    await request(t.http)
      .post(`/campaigns/${cid}/rolls`)
      .set(auth(spec))
      .send({ expression: '1d20' })
      .expect(403);
    await request(t.http)
      .post(`/campaigns/${cid}/rolls`)
      .set(auth(out))
      .send({ expression: '1d20' })
      .expect(404);
    await request(t.http).get(`/campaigns/${cid}/messages`).set(auth(out)).expect(404);
  });

  it('rolagem secreta: só o mestre e o autor recebem/veem', async () => {
    const lgm = await listen(gm);
    const l2 = await listen(p2);
    const r = await request(t.http)
      .post(`/campaigns/${cid}/rolls`)
      .set(auth(p1))
      .send({ expression: '1d20', label: 'Furtividade', visibility: 'gm' })
      .expect(201);
    await settle();
    expect(
      lgm.events.some((e) => e.event === 'chat.message' && (e.payload as { id: number }).id === r.body.id),
    ).toBe(true);
    expect(
      l2.events.some((e) => e.event === 'chat.message' && (e.payload as { id: number }).id === r.body.id),
    ).toBe(false);
    const hist2 = await request(t.http).get(`/campaigns/${cid}/messages`).set(auth(p2)).expect(200);
    expect(hist2.body.some((m: { id: number }) => m.id === r.body.id)).toBe(false);
    const hist1 = await request(t.http).get(`/campaigns/${cid}/messages`).set(auth(p1)).expect(200);
    expect(hist1.body.some((m: { id: number }) => m.id === r.body.id)).toBe(true);
  });
});

describe('NPCs e chat', () => {
  let npcId: string;
  it('mestre cria NPC com segredos; jogador não cria', async () => {
    await request(t.http).post(`/campaigns/${cid}/npcs`).set(auth(p1)).send({ name: 'x' }).expect(403);
    const r = await request(t.http)
      .post(`/campaigns/${cid}/npcs`)
      .set(auth(gm))
      .send({
        name: 'Mirella',
        appearance: 'Capa verde',
        details: { secrets: 'É espiã', stats: [{ label: 'PV', value: '12' }] },
      })
      .expect(201);
    npcId = r.body.id;
    expect(r.body.details.secrets).toBe('É espiã');
  });

  it('jogador não vê NPC oculto; depois de revelado vê só a parte pública', async () => {
    let l = await request(t.http).get(`/campaigns/${cid}/npcs`).set(auth(p1)).expect(200);
    expect(l.body).toHaveLength(0);
    await request(t.http)
      .patch(`/campaigns/${cid}/npcs/${npcId}`)
      .set(auth(gm))
      .send({ revealed: true })
      .expect(200);
    l = await request(t.http).get(`/campaigns/${cid}/npcs`).set(auth(p1)).expect(200);
    expect(l.body[0].name).toBe('Mirella');
    expect(l.body[0].details).toBeUndefined();
    expect(JSON.stringify(l.body)).not.toContain('espiã');
  });

  it('mestre fala como NPC; jogador não', async () => {
    await request(t.http)
      .post(`/campaigns/${cid}/messages`)
      .set(auth(p1))
      .send({ content: 'oi', npcId })
      .expect(403);
    await request(t.http)
      .patch(`/campaigns/${cid}/npcs/${npcId}`)
      .set(auth(gm))
      .send({ revealed: false })
      .expect(200);
    const r = await request(t.http)
      .post(`/campaigns/${cid}/messages`)
      .set(auth(gm))
      .send({ content: 'Sejam bem-vindos', npcId })
      .expect(201);
    expect(r.body.npc.name).toBe('Mirella');
    const hist = await request(t.http).get(`/campaigns/${cid}/messages?after=0`).set(auth(p1)).expect(200);
    const said = hist.body.find((m: { id: number }) => m.id === r.body.id);
    expect(said.npc.name).toBe('Mirella'); // a fala aparece com o nome do NPC mesmo oculto
  });

  it('mensagem vazia ou longa demais é rejeitada', async () => {
    await request(t.http)
      .post(`/campaigns/${cid}/messages`)
      .set(auth(p1))
      .send({ content: '   ' })
      .expect(400);
    await request(t.http)
      .post(`/campaigns/${cid}/messages`)
      .set(auth(p1))
      .send({ content: 'x'.repeat(2001) })
      .expect(400);
  });
});

describe('personagens', () => {
  let charId: string;
  it('jogador cria ficha livre; todos da mesa veem', async () => {
    const r = await request(t.http)
      .post(`/campaigns/${cid}/characters`)
      .set(auth(p1))
      .send({
        name: 'Thorin',
        concept: 'Guerreiro anão',
        sheet: {
          attributes: [{ label: 'Força', value: '16' }],
          resources: [{ label: 'PV', current: 12, max: 12 }],
        },
      })
      .expect(201);
    charId = r.body.id;
    expect(r.body).toMatchObject({ version: 1, canEdit: true, ownerName: 'P1' });
    const l = await request(t.http).get(`/campaigns/${cid}/characters`).set(auth(p2)).expect(200);
    expect(l.body[0]).toMatchObject({ name: 'Thorin', canEdit: false });
  });

  it('outro jogador não edita; versão antiga gera conflito; mestre edita', async () => {
    await request(t.http)
      .patch(`/campaigns/${cid}/characters/${charId}`)
      .set(auth(p2))
      .send({ name: 'x', version: 1 })
      .expect(403);
    await request(t.http)
      .patch(`/campaigns/${cid}/characters/${charId}`)
      .set(auth(p1))
      .send({ sheet: { resources: [{ label: 'PV', current: 7, max: 12 }] }, version: 1 })
      .expect(200);
    const c = await request(t.http)
      .patch(`/campaigns/${cid}/characters/${charId}`)
      .set(auth(gm))
      .send({ name: 'Thorin', version: 1 })
      .expect(409);
    expect(c.body.error.code).toBe('CONFLICT');
    await request(t.http)
      .patch(`/campaigns/${cid}/characters/${charId}`)
      .set(auth(gm))
      .send({ concept: 'Herói', version: 2 })
      .expect(200);
  });

  it('aparência do boneco 2D fica salva na ficha; valores estranhos são recusados', async () => {
    const appearance = {
      body: 'forte',
      skin: '#8d5a3b',
      eyes: '#3a6b8f',
      hair: { style: 'coque', color: '#9e2a1e', streak: null },
      top: { style: 'sobretudo', color: '#22313f', accent: '#c9a227' },
      bottom: { style: 'cargo', color: '#2b2b2b' },
      shoes: { style: 'botas', color: '#1a1a1a' },
      accessories: ['caveira', 'luvas'],
      held: 'katana',
      hood: false,
    };
    const r = await request(t.http)
      .post(`/campaigns/${cid}/characters`)
      .set(auth(p1))
      .send({ name: 'Aparência', sheet: { appearance } })
      .expect(201);
    const l = await request(t.http).get(`/campaigns/${cid}/characters`).set(auth(p2)).expect(200);
    const got = l.body.find((c: { id: string }) => c.id === r.body.id);
    expect(got.sheet.appearance).toMatchObject(appearance);
    await request(t.http)
      .post(`/campaigns/${cid}/characters`)
      .set(auth(p1))
      .send({ name: 'X', sheet: { appearance: { ...appearance, hair: { style: 'inventado', color: '#000000' } } } })
      .expect(400);
    await request(t.http)
      .post(`/campaigns/${cid}/characters`)
      .set(auth(p1))
      .send({ name: 'X', sheet: { appearance: { ...appearance, skin: 'url(javascript:alert(1))' } } })
      .expect(400);
    await request(t.http).delete(`/campaigns/${cid}/characters/${r.body.id}`).set(auth(p1)).expect(204);
  });

  it('ficha inválida é rejeitada', async () => {
    await request(t.http)
      .post(`/campaigns/${cid}/characters`)
      .set(auth(p1))
      .send({ name: 'X', sheet: { resources: [{ label: 'PV', current: 'muito', max: 1 }] } })
      .expect(400);
    await request(t.http)
      .post(`/campaigns/${cid}/characters`)
      .set(auth(spec))
      .send({ name: 'X' })
      .expect(403);
  });
});

describe('mapas e tokens', () => {
  let mapId: string, tokenP1: string, hidden: string, charId: string;

  beforeAll(async () => {
    const c = await request(t.http)
      .post(`/campaigns/${cid}/characters`)
      .set(auth(p2))
      .send({ name: 'Lyra' })
      .expect(201);
    charId = c.body.id;
  });

  it('mestre cria e pinta; jogador não vê enquanto não compartilhado', async () => {
    await request(t.http).post(`/campaigns/${cid}/maps`).set(auth(p1)).send({ name: 'x' }).expect(403);
    const r = await request(t.http)
      .post(`/campaigns/${cid}/maps`)
      .set(auth(gm))
      .send({ name: 'Cripta', cols: 10, rows: 8 })
      .expect(201);
    mapId = r.body.id;
    const p = await request(t.http)
      .post(`/campaigns/${cid}/maps/${mapId}/paint`)
      .set(auth(gm))
      .send({
        cells: [
          { x: 0, y: 0, terrain: 'wall' },
          { x: 1, y: 0, terrain: 'water' },
        ],
      })
      .expect(200);
    expect(p.body.terrain).toEqual({ '0,0': 'wall', '1,0': 'water' });
    const e = await request(t.http)
      .post(`/campaigns/${cid}/maps/${mapId}/paint`)
      .set(auth(gm))
      .send({ cells: [{ x: 0, y: 0, terrain: null }] })
      .expect(200);
    expect(e.body.terrain).toEqual({ '1,0': 'water' });
    await request(t.http)
      .post(`/campaigns/${cid}/maps/${mapId}/paint`)
      .set(auth(gm))
      .send({ cells: [{ x: 10, y: 0, terrain: 'wall' }] })
      .expect(400);
    expect((await request(t.http).get(`/campaigns/${cid}/maps`).set(auth(p1)).expect(200)).body).toHaveLength(
      0,
    );
    await request(t.http).get(`/campaigns/${cid}/maps/${mapId}`).set(auth(p1)).expect(404);
  });

  it('tokens: personagem vira controlável pelo dono; oculto some para jogadores', async () => {
    const a = await request(t.http)
      .post(`/campaigns/${cid}/maps/${mapId}/tokens`)
      .set(auth(gm))
      .send({ kind: 'character', label: 'Lyra', x: 1, y: 1, characterId: charId })
      .expect(201);
    expect(a.body.controlledBy).toBe(p2.id);
    tokenP1 = a.body.id;
    const h = await request(t.http)
      .post(`/campaigns/${cid}/maps/${mapId}/tokens`)
      .set(auth(gm))
      .send({ kind: 'enemy', label: 'Ghoul', x: 5, y: 5, hidden: true })
      .expect(201);
    hidden = h.body.id;
    await request(t.http)
      .post(`/campaigns/${cid}/maps/${mapId}/tokens`)
      .set(auth(gm))
      .send({ kind: 'object', label: 'Baú', x: 9, y: 7, size: 2 })
      .expect(400);
    await request(t.http)
      .patch(`/campaigns/${cid}/maps/${mapId}`)
      .set(auth(gm))
      .send({ shared: true })
      .expect(200);
    const seen = await request(t.http).get(`/campaigns/${cid}/maps/${mapId}`).set(auth(p1)).expect(200);
    expect(seen.body.tokens.map((x: { label: string }) => x.label)).toEqual(['Lyra']);
  });

  it('dono move o próprio token e todos recebem; outros não movem', async () => {
    const l1 = await listen(p1);
    await request(t.http)
      .post(`/campaigns/${cid}/maps/${mapId}/tokens/${tokenP1}/move`)
      .set(auth(p2))
      .send({ x: 3, y: 2 })
      .expect(200);
    await request(t.http)
      .post(`/campaigns/${cid}/maps/${mapId}/tokens/${tokenP1}/move`)
      .set(auth(p1))
      .send({ x: 0, y: 0 })
      .expect(403);
    await request(t.http)
      .post(`/campaigns/${cid}/maps/${mapId}/tokens/${tokenP1}/move`)
      .set(auth(p2))
      .send({ x: 10, y: 0 })
      .expect(400);
    await settle();
    expect(l1.events.find((e) => e.event === 'token.moved')?.payload).toEqual({
      mapId,
      tokenId: tokenP1,
      x: 3,
      y: 2,
    });
  });

  it('movimento de token oculto não chega aos jogadores', async () => {
    const l1 = await listen(p1);
    const lgm = await listen(gm);
    await request(t.http)
      .post(`/campaigns/${cid}/maps/${mapId}/tokens/${hidden}/move`)
      .set(auth(gm))
      .send({ x: 6, y: 6 })
      .expect(200);
    await settle();
    expect(lgm.events.some((e) => e.event === 'token.moved')).toBe(true);
    expect(l1.events.some((e) => e.event === 'token.moved')).toBe(false);
  });

  it('diminuir o mapa traz tokens para dentro', async () => {
    const r = await request(t.http)
      .patch(`/campaigns/${cid}/maps/${mapId}`)
      .set(auth(gm))
      .send({ cols: 5, rows: 5 })
      .expect(200);
    for (const tk of r.body.tokens) {
      expect(tk.x + tk.size).toBeLessThanOrEqual(5);
      expect(tk.y + tk.size).toBeLessThanOrEqual(5);
    }
  });
});

describe('membro removido para de receber eventos', () => {
  it('após remoção, não recebe mais mensagens da mesa', async () => {
    const l2 = await listen(p2);
    await request(t.http).delete(`/campaigns/${cid}/members/${p2.id}`).set(auth(gm)).expect(204);
    await settle();
    expect(l2.events.some((e) => e.event === 'campaign.rejoin')).toBe(true);
    const before = l2.events.length;
    await request(t.http)
      .post(`/campaigns/${cid}/messages`)
      .set(auth(p1))
      .send({ content: 'depois da saída' })
      .expect(201);
    await settle();
    expect(l2.events.slice(before).some((e) => e.event === 'chat.message')).toBe(false);
    expect((await l2.s.emitWithAck('campaign.join', { campaignId: cid })).ok).toBe(false);
  });
});

describe('exclusões', () => {
  it('mestre apaga NPC, mapa e personagem; jogador apaga o próprio personagem', async () => {
    const n = await request(t.http)
      .post(`/campaigns/${cid}/npcs`)
      .set(auth(gm))
      .send({ name: 'Temporário' })
      .expect(201);
    await request(t.http).delete(`/campaigns/${cid}/npcs/${n.body.id}`).set(auth(p1)).expect(403);
    await request(t.http).delete(`/campaigns/${cid}/npcs/${n.body.id}`).set(auth(gm)).expect(204);
    expect(
      (await request(t.http).get(`/campaigns/${cid}/npcs`).set(auth(gm)).expect(200)).body.some(
        (x: { id: string }) => x.id === n.body.id,
      ),
    ).toBe(false);

    const m = await request(t.http)
      .post(`/campaigns/${cid}/maps`)
      .set(auth(gm))
      .send({ name: 'Rascunho' })
      .expect(201);
    await request(t.http).delete(`/campaigns/${cid}/maps/${m.body.id}`).set(auth(gm)).expect(204);
    await request(t.http).get(`/campaigns/${cid}/maps/${m.body.id}`).set(auth(gm)).expect(404);

    const c = await request(t.http)
      .post(`/campaigns/${cid}/characters`)
      .set(auth(p1))
      .send({ name: 'Descartável' })
      .expect(201);
    await request(t.http).delete(`/campaigns/${cid}/characters/${c.body.id}`).set(auth(p1)).expect(204);
    const list = await request(t.http).get(`/campaigns/${cid}/characters`).set(auth(p1)).expect(200);
    expect(list.body.some((x: { id: string }) => x.id === c.body.id)).toBe(false);
  });
});
