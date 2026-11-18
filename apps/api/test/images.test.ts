import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeUser, setupApp, type TestCtx } from './helpers';

let t: TestCtx;
type U = Awaited<ReturnType<typeof makeUser>>;
let gm: U, pl: U, pl2: U, out: U, cid: string, mid: string, charId: string;
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });

// PNG de 3×2 pixels (gerado para o teste).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFElEQVR4XmM8ISfHAAZMEIqBgQEAEy4BCG2NhtEAAAAASUVORK5CYII=',
  'base64',
);

function upload(u: U, kind: string, buf = PNG, type = 'image/png', name = 'img.png') {
  return request(t.http)
    .post(`/campaigns/${cid}/assets`)
    .set(auth(u))
    .field('kind', kind)
    .attach('file', buf, { filename: name, contentType: type });
}

beforeAll(async () => {
  t = await setupApp();
  gm = await makeUser(t, 'gm@img.com', 'GM');
  pl = await makeUser(t, 'pl@img.com', 'PL');
  pl2 = await makeUser(t, 'pl2@img.com', 'PL2');
  out = await makeUser(t, 'out@img.com', 'Out');
  cid = (await request(t.http).post('/campaigns').set(auth(gm)).send({ name: 'Imagens' }).expect(201)).body
    .id;
  for (const u of [pl, pl2]) {
    const inv = await request(t.http)
      .post(`/campaigns/${cid}/invitations`)
      .set(auth(gm))
      .send({})
      .expect(201);
    await request(t.http).post(`/invitations/${inv.body.token}/accept`).set(auth(u)).expect(200);
  }
  mid = (
    await request(t.http).post(`/campaigns/${cid}/maps`).set(auth(gm)).send({ name: 'Porão' }).expect(201)
  ).body.id;
  charId = (
    await request(t.http).post(`/campaigns/${cid}/characters`).set(auth(pl)).send({ name: 'Rui' }).expect(201)
  ).body.id;
});
afterAll(async () => {
  await t?.teardown();
});

describe('imagens', () => {
  it('confere o conteúdo: recusa SVG e arquivo que finge ser imagem', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await upload(gm, 'map', svg, 'image/svg+xml', 'x.svg').expect(400);
    await upload(gm, 'map', Buffer.from('não sou png'), 'image/png', 'fake.png').expect(415);
    await upload(gm, 'mapa' as string).expect(400);
  });

  it('fundo de mapa: mestre envia; jogador só vê depois de compartilhar', async () => {
    const r = await upload(gm, 'map').expect(201);
    expect(r.body).toMatchObject({ kind: 'map', mime: 'image/png', width: 3, height: 2, bytes: PNG.length });
    const id = r.body.id as string;
    const map = await request(t.http)
      .patch(`/campaigns/${cid}/maps/${mid}`)
      .set(auth(gm))
      .send({ backgroundAsset: id, gridVisible: false })
      .expect(200);
    expect(map.body).toMatchObject({ backgroundAsset: id, gridVisible: false });

    const file = await request(t.http).get(`/campaigns/${cid}/assets/${id}/file`).set(auth(gm)).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(file.body as Buffer, PNG)).toBe(0);

    await request(t.http).get(`/campaigns/${cid}/assets/${id}/file`).set(auth(pl)).expect(404);
    await request(t.http)
      .patch(`/campaigns/${cid}/maps/${mid}`)
      .set(auth(gm))
      .send({ shared: true })
      .expect(200);
    await request(t.http).get(`/campaigns/${cid}/assets/${id}/file`).set(auth(pl)).expect(200);
    await request(t.http).get(`/campaigns/${cid}/assets/${id}/file`).set(auth(out)).expect(404);
  });

  it('jogador não envia fundo de mapa nem imagem de token', async () => {
    await upload(pl, 'map').expect(403);
    await upload(pl, 'token').expect(403);
  });

  it('retrato do personagem aparece no token e no combate', async () => {
    const p = (await upload(pl, 'portrait').expect(201)).body.id as string;
    const cur = (
      await request(t.http).get(`/campaigns/${cid}/characters`).set(auth(pl)).expect(200)
    ).body.find((c: { id: string }) => c.id === charId);
    const upd = await request(t.http)
      .patch(`/campaigns/${cid}/characters/${charId}`)
      .set(auth(pl))
      .send({ portraitAsset: p, version: cur.version })
      .expect(200);
    expect(upd.body.portraitAsset).toBe(p);
    // Outro jogador vê o retrato
    await request(t.http).get(`/campaigns/${cid}/assets/${p}/file`).set(auth(pl2)).expect(200);

    const tok = (
      await request(t.http)
        .post(`/campaigns/${cid}/maps/${mid}/tokens`)
        .set(auth(gm))
        .send({ kind: 'character', label: 'Rui', x: 1, y: 1, characterId: charId })
        .expect(201)
    ).body;
    const map = (await request(t.http).get(`/campaigns/${cid}/maps/${mid}`).set(auth(pl2)).expect(200)).body;
    const seen = map.tokens.find((x: { id: string }) => x.id === tok.id);
    expect(seen).toMatchObject({ imageAsset: null, image: p });

    await request(t.http).post(`/campaigns/${cid}/combat`).set(auth(gm)).send({}).expect(201);
    const combat = (await request(t.http).get(`/campaigns/${cid}/combat`).set(auth(pl2)).expect(200)).body;
    expect(combat.combatants[0]).toMatchObject({ name: 'Rui', image: p });
  });

  it('jogador não usa a imagem secreta do mestre como retrato', async () => {
    const secret = (await upload(gm, 'token').expect(201)).body.id as string;
    const cur = (
      await request(t.http).get(`/campaigns/${cid}/characters`).set(auth(pl)).expect(200)
    ).body.find((c: { id: string }) => c.id === charId);
    await request(t.http)
      .patch(`/campaigns/${cid}/characters/${charId}`)
      .set(auth(pl))
      .send({ portraitAsset: secret, version: cur.version })
      .expect(403);
    await request(t.http).get(`/campaigns/${cid}/assets/${secret}/file`).set(auth(pl)).expect(404);
  });

  it('imagem de token oculto fica escondida; lista e espaço usado', async () => {
    const img = (await upload(gm, 'token').expect(201)).body.id as string;
    const tok = (
      await request(t.http)
        .post(`/campaigns/${cid}/maps/${mid}/tokens`)
        .set(auth(gm))
        .send({ kind: 'enemy', label: 'Zumbi', x: 3, y: 3, hidden: true, imageAsset: img })
        .expect(201)
    ).body;
    expect(tok.image).toBe(img);
    await request(t.http).get(`/campaigns/${cid}/assets/${img}/file`).set(auth(pl)).expect(404);
    await request(t.http)
      .patch(`/campaigns/${cid}/maps/${mid}/tokens/${tok.id}`)
      .set(auth(gm))
      .send({ hidden: false })
      .expect(204);
    await request(t.http).get(`/campaigns/${cid}/assets/${img}/file`).set(auth(pl)).expect(200);

    const all = (await request(t.http).get(`/campaigns/${cid}/assets`).set(auth(gm)).expect(200)).body;
    expect(all.length).toBeGreaterThanOrEqual(4);
    expect(all[0]).not.toHaveProperty('data');
    const mine = (await request(t.http).get(`/campaigns/${cid}/assets`).set(auth(pl)).expect(200)).body;
    expect(mine.map((a: { kind: string }) => a.kind)).toEqual(['portrait']);
    const usage = (await request(t.http).get(`/campaigns/${cid}/assets/usage`).set(auth(pl)).expect(200))
      .body;
    expect(usage).toEqual({ used: PNG.length * all.length, limit: 60 * 1024 * 1024 });
  });

  it('apagar a imagem tira ela do mapa', async () => {
    const all = (await request(t.http).get(`/campaigns/${cid}/assets`).set(auth(gm)).expect(200)).body;
    const bg = all.find((a: { kind: string }) => a.kind === 'map').id;
    await request(t.http).delete(`/campaigns/${cid}/assets/${bg}`).set(auth(pl)).expect(404);
    await request(t.http).delete(`/campaigns/${cid}/assets/${bg}`).set(auth(gm)).expect(204);
    const map = (await request(t.http).get(`/campaigns/${cid}/maps/${mid}`).set(auth(gm)).expect(200)).body;
    expect(map.backgroundAsset).toBeNull();
  });
});

describe('modelos de mapa', () => {
  it('cria a casa abandonada já com terreno e objetos', async () => {
    const r = await request(t.http)
      .post(`/campaigns/${cid}/maps`)
      .set(auth(gm))
      .send({ name: 'Casa', template: 'abandoned_house' })
      .expect(201);
    expect(r.body).toMatchObject({ cols: 24, rows: 16 });
    expect(Object.keys(r.body.terrain).length).toBeGreaterThan(100);
    const icons = r.body.tokens.map((x: { icon: string }) => x.icon);
    expect(icons).toEqual(expect.arrayContaining(['door', 'bed', 'ritual', 'body']));
    const door = r.body.tokens.find((x: { icon: string }) => x.icon === 'door');
    expect(door).toMatchObject({ kind: 'object', state: expect.stringMatching(/open|closed/) });
    await request(t.http)
      .post(`/campaigns/${cid}/maps`)
      .set(auth(gm))
      .send({ name: 'X', template: 'castelo_inexistente' })
      .expect(400);
  });
});
