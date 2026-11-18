import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeUser, setupApp, type TestCtx } from './helpers';

let t: TestCtx;
type U = Awaited<ReturnType<typeof makeUser>>;
let gm: U, pl: U, cid: string, charId: string;
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });

beforeAll(async () => {
  t = await setupApp();
  gm = await makeUser(t, 'gm@ac.com', 'GM');
  pl = await makeUser(t, 'pl@ac.com', 'PL');
  cid = (await request(t.http).post('/campaigns').set(auth(gm)).send({ name: 'Arsenal' }).expect(201)).body
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

describe('armas, rituais e criaturas do livro', () => {
  it('ficha guarda armas, proteção e rituais validados', async () => {
    await request(t.http)
      .post(`/campaigns/${cid}/characters`)
      .set(auth(pl))
      .send({ name: 'X', sheet: { system: { rituals: ['ritual_inventado'] } } })
      .expect(400);
    const r = await request(t.http)
      .post(`/campaigns/${cid}/characters`)
      .set(auth(pl))
      .send({
        name: 'Dante',
        sheet: {
          system: {
            attributes: { AGI: 2, FOR: 3, INT: 1, PRE: 2, VIG: 1 },
            fields: { classe: 'ocultista', nex: '25', origem: 'academico' },
            skills: { luta: 'treinado' },
            weapons: [{ ref: 'machado' }],
            protections: [{ ref: 'leve' }],
            rituals: ['eletrocussao', 'cineraria'],
          },
        },
      })
      .expect(201);
    charId = r.body.id;
    expect(r.body.sheet.system.weapons[0]).toMatchObject({ name: 'Machado', damage: '1d8', critMult: 3 });
  });

  it('ataque: teste de Luta e dano com Força, na crônica', async () => {
    await request(t.http)
      .post(`/campaigns/${cid}/characters/${charId}/attack`)
      .set(auth(gm))
      .send({ weapon: 5 })
      .expect(400);
    const r = await request(t.http)
      .post(`/campaigns/${cid}/characters/${charId}/attack`)
      .set(auth(pl))
      .send({ weapon: 0 })
      .expect(201);
    const [atk, dmg] = r.body.messages;
    expect(atk.roll.expression).toBe('3d20kh1+5');
    expect(dmg.roll.expression).toBe(r.body.critical ? '3d8+3' : '1d8+3');
    expect(dmg.roll.label).toMatch(/Dante: dano/);
  });

  it('conjurar: gasta PE, rola custo paranormal e o dano do ritual', async () => {
    const r = await request(t.http)
      .post(`/campaigns/${cid}/characters/${charId}/cast`)
      .set(auth(pl))
      .send({ ritual: 'eletrocussao' })
      .expect(201);
    expect(r.body.messages[0].content).toMatch(/conjura Eletrocussão: −1 PE · DT 17/);
    expect(r.body.messages[1].roll.label).toMatch(/custo paranormal \(DT 21\)/);
    expect(r.body.messages[2].roll.expression).toBe('3d6');
    const pe = r.body.character.sheet.system.current.pe;
    expect(pe).toBe(r.body.character.sheet.system.current.pe);
    expect(typeof pe).toBe('number');
    await request(t.http)
      .post(`/campaigns/${cid}/characters/${charId}/cast`)
      .set(auth(pl))
      .send({ ritual: 'eletrocussao', form: 'verdadeiro' })
      .expect(400);
    const f = await request(t.http)
      .post(`/campaigns/${cid}/characters/${charId}/cast`)
      .set(auth(pl))
      .send({ ritual: 'cineraria' })
      .expect(201);
    expect(f.body.messages).toHaveLength(1);
    expect(f.body.notes.join(' ')).toMatch(/Sanidade máxima, para sempre/);
  });

  it('mestre coloca criatura do livro: PV, Iniciativa e ataque da ficha', async () => {
    await request(t.http)
      .post(`/campaigns/${cid}/combat`)
      .set(auth(gm))
      .send({ includeCharacters: false })
      .expect(201);
    await request(t.http)
      .post(`/campaigns/${cid}/combat/combatants`)
      .set(auth(gm))
      .send({ kind: 'creature', creatureKey: 'nao_existe' })
      .expect(404);
    const r = await request(t.http)
      .post(`/campaigns/${cid}/combat/combatants`)
      .set(auth(gm))
      .send({ kind: 'creature', creatureKey: 'zumbi_de_sangue', count: 2 })
      .expect(201);
    const z = r.body.combatants.find((c: { name: string }) => c.name === 'Zumbi de Sangue 1');
    expect(z.hp).toEqual({ current: 45, max: 45 });
    expect(z.creature).toMatchObject({ defesa: 17, page: 212 });
    const p = await request(t.http).get(`/campaigns/${cid}/combat`).set(auth(pl)).expect(200);
    expect(p.body.combatants[0].creature).toBeNull();
    await request(t.http)
      .post(`/campaigns/${cid}/combat/combatants/${z.id}/initiative`)
      .set(auth(gm))
      .send({})
      .expect(200);
    const msgs = await request(t.http).get(`/campaigns/${cid}/messages`).set(auth(gm)).expect(200);
    expect(msgs.body.at(-1).roll.expression).toBe('2d20kh1+5');
    await request(t.http)
      .post(`/campaigns/${cid}/combat/combatants/${z.id}/attack`)
      .set(auth(pl))
      .send({ attack: 0 })
      .expect(403);
    const a = await request(t.http)
      .post(`/campaigns/${cid}/combat/combatants/${z.id}/attack`)
      .set(auth(gm))
      .send({ attack: 0 })
      .expect(200);
    expect(a.body.messages[0].roll.expression).toBe('2d20kh1+5');
    expect(a.body.messages[1].roll.label).toMatch(/Zumbi de Sangue 1: dano/);
  });
});
