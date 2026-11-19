import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeUser, setupApp, type TestCtx } from './helpers';

/** "Procurar ao redor": rolagem no servidor revela segredos só para quem achou. */
let t: TestCtx;
type U = Awaited<ReturnType<typeof makeUser>>;
let gm: U, ana: U, bia: U, cid: string, mid: string, anaChar: string, biaChar: string;
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });
const labels = async (u: U) =>
  (
    (await request(t.http).get(`/campaigns/${cid}/maps/${mid}`).set(auth(u)).expect(200)).body.tokens as {
      label: string;
    }[]
  )
    .map((x) => x.label)
    .sort();

beforeAll(async () => {
  t = await setupApp();
  gm = await makeUser(t, 'gm@sec.com', 'GM');
  ana = await makeUser(t, 'ana@sec.com', 'Ana');
  bia = await makeUser(t, 'bia@sec.com', 'Bia');
  cid = (await request(t.http).post('/campaigns').set(auth(gm)).send({ name: 'Segredos' }).expect(201)).body
    .id;
  for (const u of [ana, bia]) {
    const inv = await request(t.http)
      .post(`/campaigns/${cid}/invitations`)
      .set(auth(gm))
      .send({})
      .expect(201);
    await request(t.http).post(`/invitations/${inv.body.token}/accept`).set(auth(u)).expect(200);
  }
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
  anaChar = (
    await request(t.http)
      .post(`/campaigns/${cid}/characters`)
      .set(auth(ana))
      .send({ name: 'Rui' })
      .expect(201)
  ).body.id;
  biaChar = (
    await request(t.http)
      .post(`/campaigns/${cid}/characters`)
      .set(auth(bia))
      .send({ name: 'Lia' })
      .expect(201)
  ).body.id;
  mid = (
    await request(t.http).post(`/campaigns/${cid}/maps`).set(auth(gm)).send({ name: 'Porão' }).expect(201)
  ).body.id;
  const tok = (body: object) =>
    request(t.http).post(`/campaigns/${cid}/maps/${mid}/tokens`).set(auth(gm)).send(body).expect(201);
  await tok({ kind: 'character', label: 'Rui', x: 2, y: 2, characterId: anaChar });
  await tok({ kind: 'character', label: 'Lia', x: 15, y: 10, characterId: biaChar });
  // DT 1: qualquer rolagem acha. DT 60: impossível. Longe: fora do alcance.
  await tok({
    kind: 'object',
    label: 'Chave',
    icon: 'knife',
    x: 3,
    y: 3,
    hidden: true,
    secretSkill: 'percepcao',
    secretDt: 1,
    secretRadius: 2,
  });
  await tok({
    kind: 'object',
    label: 'Cofre',
    icon: 'chest',
    x: 2,
    y: 3,
    hidden: true,
    secretSkill: 'percepcao',
    secretDt: 60,
  });
  await tok({
    kind: 'object',
    label: 'Diário',
    icon: 'crate',
    x: 1,
    y: 1,
    hidden: true,
    secretSkill: 'investigacao',
    secretDt: 1,
  });
  await tok({
    kind: 'object',
    label: 'Alçapão',
    icon: 'trap',
    x: 12,
    y: 12,
    hidden: true,
    secretSkill: 'percepcao',
    secretDt: 1,
    secretRadius: 1,
  });
  await request(t.http)
    .patch(`/campaigns/${cid}/maps/${mid}`)
    .set(auth(gm))
    .send({ shared: true })
    .expect(200);
});
afterAll(async () => {
  await t?.teardown();
});

describe('segredos no mapa', () => {
  it('mestre vê o segredo configurado; jogadores não veem nem a peça nem a DT', async () => {
    const map = (await request(t.http).get(`/campaigns/${cid}/maps/${mid}`).set(auth(gm)).expect(200)).body;
    const chave = map.tokens.find((x: { label: string }) => x.label === 'Chave');
    expect(chave).toMatchObject({
      hidden: true,
      secret: { skill: 'percepcao', dt: 1, radius: 2 },
      foundBy: [],
    });
    expect(await labels(ana)).toEqual(['Lia', 'Rui']);
  });

  it('Ana procura com Percepção: acha só o que está perto e dentro da DT', async () => {
    const r = await request(t.http)
      .post(`/campaigns/${cid}/maps/${mid}/search`)
      .set(auth(ana))
      .send({ characterId: anaChar, skill: 'percepcao' })
      .expect(200);
    expect(r.body.total).toBeGreaterThan(0);
    expect(r.body.found.map((x: { label: string }) => x.label)).toEqual(['Chave']);
    expect(await labels(ana)).toEqual(['Chave', 'Lia', 'Rui']);
    // para Ana a peça aparece normal e marcada como descoberta, sem dados do segredo
    const map = (await request(t.http).get(`/campaigns/${cid}/maps/${mid}`).set(auth(ana)).expect(200)).body;
    const chave = map.tokens.find((x: { label: string }) => x.label === 'Chave');
    expect(chave).toMatchObject({ hidden: false, discovered: true });
    expect(chave.secret).toBeUndefined();
    // Bia continua sem ver
    expect(await labels(bia)).toEqual(['Lia', 'Rui']);
    // o mestre vê quem descobriu
    const gmMap = (await request(t.http).get(`/campaigns/${cid}/maps/${mid}`).set(auth(gm)).expect(200)).body;
    expect(gmMap.tokens.find((x: { label: string }) => x.label === 'Chave').foundBy).toEqual(['Ana']);
  });

  it('a rolagem fica no chat como secreta (só ela e o mestre veem)', async () => {
    const mine = (await request(t.http).get(`/campaigns/${cid}/messages`).set(auth(ana)).expect(200)).body;
    expect(
      mine.some((m: { kind: string; visibility: string }) => m.kind === 'roll' && m.visibility === 'gm'),
    ).toBe(true);
    const other = (await request(t.http).get(`/campaigns/${cid}/messages`).set(auth(bia)).expect(200)).body;
    expect(other.filter((m: { kind: string }) => m.kind === 'roll')).toHaveLength(0);
  });

  it('outra perícia acha outro segredo', async () => {
    const r = await request(t.http)
      .post(`/campaigns/${cid}/maps/${mid}/search`)
      .set(auth(ana))
      .send({ characterId: anaChar, skill: 'investigacao' })
      .expect(200);
    expect(r.body.found.map((x: { label: string }) => x.label)).toEqual(['Diário']);
  });

  it('não dá para procurar com o personagem de outra pessoa nem sem token no mapa', async () => {
    await request(t.http)
      .post(`/campaigns/${cid}/maps/${mid}/search`)
      .set(auth(ana))
      .send({ characterId: biaChar, skill: 'percepcao' })
      .expect(403);
    const solo = (
      await request(t.http)
        .post(`/campaigns/${cid}/characters`)
        .set(auth(bia))
        .send({ name: 'Sem token' })
        .expect(201)
    ).body.id;
    await request(t.http)
      .post(`/campaigns/${cid}/maps/${mid}/search`)
      .set(auth(bia))
      .send({ characterId: solo, skill: 'percepcao' })
      .expect(400);
  });

  it('Bia, longe de tudo, não acha nada', async () => {
    const r = await request(t.http)
      .post(`/campaigns/${cid}/maps/${mid}/search`)
      .set(auth(bia))
      .send({ characterId: biaChar, skill: 'percepcao' })
      .expect(200);
    expect(r.body.found).toEqual([]);
  });
});
