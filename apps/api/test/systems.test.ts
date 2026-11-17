import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeUser, setupApp, type TestCtx } from './helpers';
import { makePdf } from './pdf-fixture';

let t: TestCtx;
type U = Awaited<ReturnType<typeof makeUser>>;
let gm: U, pl: U, out: U;
let cid: string, sysId: string, docId: string, charId: string;
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });

const BOOK = makePdf([
  'Livro de teste',
  'Testes\nRole uma quantidade de dados igual ao atributo e use o melhor resultado.',
  'Furtividade (Agi)\nVoce pode se esconder e se mover sem ser percebido. Pericia de Agilidade.',
  'Sanidade\nA Sanidade mede a resiliencia mental do agente.',
]);

async function waitReady(id: string) {
  for (let i = 0; i < 100; i++) {
    const r = await request(t.http).get(`/systems/${sysId}`).set(auth(gm)).expect(200);
    const doc = r.body.documents.find((x: { id: string }) => x.id === id);
    if (doc.status === 'ready' || doc.status === 'failed') return doc;
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error('timeout');
}

beforeAll(async () => {
  t = await setupApp({ STORAGE_DIR: await mkdtemp(join(tmpdir(), 'rpg-store-')) });
  gm = await makeUser(t, 'gm@s.com', 'GM');
  pl = await makeUser(t, 'pl@s.com', 'PL');
  out = await makeUser(t, 'out@s.com', 'OUT');
  cid = (await request(t.http).post('/campaigns').set(auth(gm)).send({ name: 'Ordem' }).expect(201)).body.id;
  const inv = await request(t.http).post(`/campaigns/${cid}/invitations`).set(auth(gm)).send({}).expect(201);
  await request(t.http).post(`/invitations/${inv.body.token}/accept`).set(auth(pl)).expect(200);
});
afterAll(async () => t?.teardown());

describe('sistemas', () => {
  it('lista modelos e cria Ordem Paranormal a partir do modelo', async () => {
    const tpl = await request(t.http).get('/system-templates').set(auth(gm)).expect(200);
    expect(tpl.body.map((x: { id: string }) => x.id)).toContain('ordem_paranormal');
    const r = await request(t.http)
      .post('/systems')
      .set(auth(gm))
      .send({ templateId: 'ordem_paranormal' })
      .expect(201);
    sysId = r.body.id;
    expect(r.body).toMatchObject({ name: 'Ordem Paranormal RPG', version: 1, canEdit: true, documents: [] });
    await request(t.http).post('/systems').set(auth(gm)).send({ templateId: 'nao_existe' }).expect(404);
  });

  it('outros usuários não veem o sistema', async () => {
    await request(t.http).get(`/systems/${sysId}`).set(auth(out)).expect(404);
    expect((await request(t.http).get('/systems').set(auth(pl)).expect(200)).body).toHaveLength(0);
  });
});

describe('livro (PDF)', () => {
  it('rejeita arquivo que não é PDF, mesmo com extensão .pdf', async () => {
    const r = await request(t.http)
      .post(`/systems/${sysId}/documents`)
      .set(auth(gm))
      .attach('file', Buffer.from('<html>oi</html>'), 'falso.pdf')
      .expect(400);
    expect(r.body.error.message).toMatch(/não é um PDF/);
    await request(t.http).post(`/systems/${sysId}/documents`).set(auth(gm)).expect(400);
  });

  it('jogador não envia livro para sistema do mestre', async () => {
    await request(t.http)
      .post(`/systems/${sysId}/documents`)
      .set(auth(pl))
      .attach('file', BOOK, 'livro.pdf')
      .expect(404);
  });

  it('envia, processa em segundo plano e extrai todas as páginas', async () => {
    const r = await request(t.http)
      .post(`/systems/${sysId}/documents`)
      .set(auth(gm))
      .attach('file', BOOK, 'Livro de Regras.pdf')
      .expect(201);
    docId = r.body.id;
    expect(r.body.status).toBe('queued');
    const doc = await waitReady(docId);
    expect(doc).toMatchObject({ status: 'ready', pageCount: 4, progress: 100 });
  });

  it('o mesmo livro não é enviado duas vezes', async () => {
    await request(t.http)
      .post(`/systems/${sysId}/documents`)
      .set(auth(gm))
      .attach('file', BOOK, 'copia.pdf')
      .expect(409);
  });

  it('busca encontra a página certa, sem depender de acentos', async () => {
    const r = await request(t.http)
      .get(`/systems/${sysId}/search`)
      .query({ q: 'perícia agilidade' })
      .set(auth(gm))
      .expect(200);
    expect(r.body[0]).toMatchObject({ page: 3, filename: 'Livro de Regras.pdf' });
    expect(r.body[0].snippet).toContain('«');
    const p = await request(t.http)
      .get(`/systems/${sysId}/documents/${docId}/pages/4`)
      .set(auth(gm))
      .expect(200);
    expect(p.body.text).toContain('Sanidade');
    await request(t.http).get(`/systems/${sysId}/search`).query({ q: 'a' }).set(auth(gm)).expect(400);
  });
});

describe('campanha com Ordem Paranormal', () => {
  it('jogador só consulta o livro depois que a campanha usa o sistema', async () => {
    expect(
      (
        await request(t.http)
          .get(`/campaigns/${cid}/rules`)
          .query({ q: 'sanidade' })
          .set(auth(pl))
          .expect(200)
      ).body,
    ).toEqual([]);
    await request(t.http)
      .post(`/campaigns/${cid}/system`)
      .set(auth(pl))
      .send({ systemId: sysId })
      .expect(403);
    const r = await request(t.http)
      .post(`/campaigns/${cid}/system`)
      .set(auth(gm))
      .send({ systemId: sysId })
      .expect(200);
    expect(r.body).toMatchObject({ name: 'Ordem Paranormal RPG', hasBook: true });
    const hits = await request(t.http)
      .get(`/campaigns/${cid}/rules`)
      .query({ q: 'sanidade' })
      .set(auth(pl))
      .expect(200);
    expect(hits.body[0].page).toBe(4);
    const c = await request(t.http).get(`/campaigns/${cid}`).set(auth(pl)).expect(200);
    expect(c.body.system).toEqual({ id: sysId, name: 'Ordem Paranormal RPG' });
    await request(t.http).get(`/campaigns/${cid}/rules`).query({ q: 'sanidade' }).set(auth(out)).expect(404);
  });

  it('ficha do sistema é validada pelas regras', async () => {
    await request(t.http)
      .post(`/campaigns/${cid}/characters`)
      .set(auth(pl))
      .send({ name: 'X', sheet: { system: { attributes: { AGI: 9 } } } })
      .expect(400);
    const r = await request(t.http)
      .post(`/campaigns/${cid}/characters`)
      .set(auth(pl))
      .send({
        name: 'Arthur',
        sheet: {
          system: {
            attributes: { AGI: 3, FOR: 0, INT: 2, PRE: 1, VIG: 2 },
            fields: { classe: 'especialista', nex: '5', origem: 'criminoso' },
            skills: { furtividade: 'treinado' },
          },
        },
      })
      .expect(201);
    charId = r.body.id;
    expect(r.body.sheet.system.skills).toEqual({ furtividade: 'treinado' });
  });

  it('teste de perícia segue a regra do livro e vai para o chat', async () => {
    const r = await request(t.http)
      .post(`/campaigns/${cid}/characters/${charId}/check`)
      .set(auth(pl))
      .send({ skill: 'furtividade' })
      .expect(201);
    expect(r.body.message.roll.expression).toBe('3d20kh1+5');
    expect(r.body.message.roll.label).toBe('Arthur: Furtividade');
    const z = await request(t.http)
      .post(`/campaigns/${cid}/characters/${charId}/check`)
      .set(auth(pl))
      .send({ attribute: 'FOR' })
      .expect(201);
    expect(z.body.message.roll.expression).toBe('2d20kl1');
    const n = await request(t.http)
      .post(`/campaigns/${cid}/characters/${charId}/check`)
      .set(auth(pl))
      .send({ skill: 'ocultismo' })
      .expect(201);
    expect(n.body.notes.join(' ')).toMatch(/treinado/);
    await request(t.http)
      .post(`/campaigns/${cid}/characters/${charId}/check`)
      .set(auth(pl))
      .send({})
      .expect(400);
    await request(t.http)
      .post(`/campaigns/${cid}/characters/${charId}/check`)
      .set(auth(pl))
      .send({ skill: 'voar' })
      .expect(400);
    await request(t.http)
      .post(`/campaigns/${cid}/characters/${charId}/check`)
      .set(auth(out))
      .send({ skill: 'luta' })
      .expect(404);
  });

  it('apagar o livro remove o texto da busca', async () => {
    await request(t.http).delete(`/systems/${sysId}/documents/${docId}`).set(auth(pl)).expect(404);
    await request(t.http).delete(`/systems/${sysId}/documents/${docId}`).set(auth(gm)).expect(204);
    expect(
      (
        await request(t.http)
          .get(`/systems/${sysId}/search`)
          .query({ q: 'sanidade' })
          .set(auth(gm))
          .expect(200)
      ).body,
    ).toEqual([]);
  });
});
