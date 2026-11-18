import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeUser, setupApp, type TestCtx } from './helpers';

let t: TestCtx;
type U = Awaited<ReturnType<typeof makeUser>>;
let gm: U, pl: U, other: U, cid: string, plainCid: string;
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });
const opSheet = {
  system: {
    attributes: { AGI: 2, FOR: 2, INT: 1, PRE: 2, VIG: 1 },
    fields: { classe: 'combatente', nex: '10', origem: 'militar' },
    weapons: [{ ref: 'machado' }],
  },
};

beforeAll(async () => {
  t = await setupApp();
  gm = await makeUser(t, 'gm@lib.com', 'GM');
  pl = await makeUser(t, 'pl@lib.com', 'PL');
  other = await makeUser(t, 'other@lib.com', 'Outro');
  cid = (await request(t.http).post('/campaigns').set(auth(gm)).send({ name: 'Com sistema' }).expect(201))
    .body.id;
  plainCid = (await request(t.http).post('/campaigns').set(auth(gm)).send({ name: 'Livre' }).expect(201)).body
    .id;
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
});
afterAll(async () => {
  await t?.teardown();
});

describe('biblioteca de fichas', () => {
  let charId: string, npcId: string;
  it('cria fichas validadas pelo modelo do sistema; cada um só vê as suas', async () => {
    await request(t.http)
      .post('/library')
      .set(auth(pl))
      .send({
        kind: 'character',
        name: 'X',
        systemTemplate: 'ordem_paranormal',
        sheet: { system: { rituals: ['nada'] } },
      })
      .expect(400);
    const c = await request(t.http)
      .post('/library')
      .set(auth(pl))
      .send({ kind: 'character', name: 'Rafa', systemTemplate: 'ordem_paranormal', sheet: opSheet })
      .expect(201);
    charId = c.body.id;
    expect(c.body.sheet.system.weapons[0].name).toBe('Machado');
    const n = await request(t.http)
      .post('/library')
      .set(auth(gm))
      .send({
        kind: 'npc',
        name: 'Vigia',
        systemTemplate: 'ordem_paranormal',
        sheet: opSheet,
        npc: { appearance: 'Alto', details: { secrets: 'Traidor' } },
      })
      .expect(201);
    npcId = n.body.id;
    expect((await request(t.http).get('/library').set(auth(pl)).expect(200)).body).toHaveLength(1);
    await request(t.http).get(`/library/${charId}`).set(auth(other)).expect(404);
    await request(t.http).patch(`/library/${charId}`).set(auth(pl)).send({ name: 'Rafaela' }).expect(200);
  });

  it('leva para a campanha: personagem (jogador) e NPC (mestre) com a ficha', async () => {
    const r = await request(t.http)
      .post(`/library/${charId}/use`)
      .set(auth(pl))
      .send({ campaignId: cid })
      .expect(201);
    expect(r.body).toMatchObject({ kind: 'character', item: { name: 'Rafaela' } });
    expect(r.body.item.sheet.system.weapons).toHaveLength(1);
    await request(t.http)
      .post(`/library/${charId}/use`)
      .set(auth(other))
      .send({ campaignId: cid })
      .expect(404);
    const n = await request(t.http)
      .post(`/library/${npcId}/use`)
      .set(auth(gm))
      .send({ campaignId: cid })
      .expect(201);
    expect(n.body.item.details).toMatchObject({ secrets: 'Traidor' });
    expect(n.body.item.details.sheet.system.weapons[0].name).toBe('Machado');
    // Campanha sem sistema: a ficha entra sem a parte do sistema.
    const p = await request(t.http)
      .post(`/library/${npcId}/use`)
      .set(auth(gm))
      .send({ campaignId: plainCid })
      .expect(201);
    expect(p.body.item.details.sheet.system).toBeUndefined();
  });

  it('guarda na biblioteca uma cópia de personagem da campanha', async () => {
    const chars = await request(t.http).get(`/campaigns/${cid}/characters`).set(auth(pl)).expect(200);
    const r = await request(t.http)
      .post(`/campaigns/${cid}/library`)
      .set(auth(pl))
      .send({ characterId: chars.body[0].id })
      .expect(201);
    expect(r.body).toMatchObject({ kind: 'character', systemTemplate: 'ordem_paranormal' });
  });
});

describe('NPC com ficha completa', () => {
  it('mestre ataca e conjura pelo NPC; jogador não vê a ficha nem age', async () => {
    const npc = (
      await request(t.http)
        .post(`/campaigns/${cid}/npcs`)
        .set(auth(gm))
        .send({
          name: 'Cultista',
          details: {
            sheet: {
              system: {
                ...opSheet.system,
                rituals: ['eletrocussao'],
                fields: { classe: 'ocultista', nex: '25', origem: 'religioso' },
              },
            },
          },
        })
        .expect(201)
    ).body;
    const a = await request(t.http)
      .post(`/campaigns/${cid}/npcs/${npc.id}/attack`)
      .set(auth(gm))
      .send({ weapon: 0 })
      .expect(201);
    expect(a.body.messages[1].roll.label).toMatch(/Cultista: dano/);
    const c = await request(t.http)
      .post(`/campaigns/${cid}/npcs/${npc.id}/cast`)
      .set(auth(gm))
      .send({ ritual: 'eletrocussao' })
      .expect(201);
    expect(c.body.messages[0].content).toMatch(/Cultista conjura Eletrocussão/);
    await request(t.http)
      .post(`/campaigns/${cid}/npcs/${npc.id}/attack`)
      .set(auth(pl))
      .send({ weapon: 0 })
      .expect(403);
    const list = await request(t.http).get(`/campaigns/${cid}/npcs`).set(auth(gm)).expect(200);
    const saved = list.body.find((x: { id: string }) => x.id === npc.id);
    expect(saved.details.sheet.system.current.pe).toBe(29); // 30 PE − 1 (1º círculo)
    // No combate, entra com o PV da ficha e o mestre vê armas e rituais
    await request(t.http)
      .post(`/campaigns/${cid}/combat`)
      .set(auth(gm))
      .send({ includeCharacters: false })
      .expect(201);
    const cb = await request(t.http)
      .post(`/campaigns/${cid}/combat/combatants`)
      .set(auth(gm))
      .send({ kind: 'npc', npcId: npc.id })
      .expect(201);
    const row = cb.body.combatants[0];
    expect(row.hp.max).toBeGreaterThan(0);
    expect(row.npcSheet).toMatchObject({
      weapons: [{ name: 'Machado' }],
      rituals: [{ key: 'eletrocussao' }],
    });
  });
});

describe('interlúdio e Sanidade permanente', () => {
  it('descansar recupera pela regra; jogador não apaga perda permanente', async () => {
    const chars = await request(t.http).get(`/campaigns/${cid}/characters`).set(auth(pl)).expect(200);
    const ch = chars.body[0];
    const hurt = { ...ch.sheet, system: { ...ch.sheet.system, current: { pv: 1, pe: 0 }, perm: { san: 2 } } };
    const u = await request(t.http)
      .patch(`/campaigns/${cid}/characters/${ch.id}`)
      .set(auth(pl))
      .send({ version: ch.version, sheet: hurt })
      .expect(200);
    expect(u.body.sheet.system.perm ?? {}).toEqual({});
    const g = await request(t.http)
      .patch(`/campaigns/${cid}/characters/${ch.id}`)
      .set(auth(gm))
      .send({ version: u.body.version, sheet: hurt })
      .expect(200);
    expect(g.body.sheet.system.perm).toEqual({ san: 2 });
    const r = await request(t.http)
      .post(`/campaigns/${cid}/characters/${ch.id}/rest`)
      .set(auth(pl))
      .send({ sleep: true, quality: 'confortavel' })
      .expect(201);
    expect(r.body.messages[0].content).toMatch(/descansa no interlúdio/);
    // NEX 10% → limite 2; confortável x2 → +4
    expect(r.body.character.sheet.system.current).toMatchObject({ pv: 5, pe: 4 });
    await request(t.http)
      .post(`/campaigns/${cid}/characters/${ch.id}/rest`)
      .set(auth(pl))
      .send({ quality: 'normal' })
      .expect(400);
  });
});

describe('mesa de treino', () => {
  it('cria uma vez, pronta para jogar, e pode recomeçar', async () => {
    const a = await request(t.http).post('/sandbox').set(auth(other)).expect(200);
    expect(a.body.created).toBe(true);
    const b = await request(t.http).post('/sandbox').set(auth(other)).expect(200);
    expect(b.body).toEqual({ id: a.body.id, created: false });
    const camp = await request(t.http).get(`/campaigns/${a.body.id}`).set(auth(other)).expect(200);
    expect(camp.body).toMatchObject({
      sandbox: true,
      myRole: 'owner',
      system: { name: 'Ordem Paranormal RPG' },
    });
    const chars = await request(t.http)
      .get(`/campaigns/${a.body.id}/characters`)
      .set(auth(other))
      .expect(200);
    expect(chars.body.map((c: { name: string }) => c.name).sort()).toEqual([
      'Arthur (exemplo)',
      'Lívia (exemplo)',
    ]);
    const npcs = await request(t.http).get(`/campaigns/${a.body.id}/npcs`).set(auth(other)).expect(200);
    expect(npcs.body).toHaveLength(2);
    const maps = await request(t.http).get(`/campaigns/${a.body.id}/maps`).set(auth(other)).expect(200);
    expect(maps.body[0]).toMatchObject({ name: 'Porão da pensão', shared: true });
    await request(t.http).get(`/campaigns/${a.body.id}`).set(auth(pl)).expect(404);
    await request(t.http).delete('/sandbox').set(auth(other)).expect(204);
    const c = await request(t.http).post('/sandbox').set(auth(other)).expect(200);
    expect(c.body.created).toBe(true);
    expect(c.body.id).not.toBe(a.body.id);
  });
});
