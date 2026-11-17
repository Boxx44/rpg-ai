import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeUser, setupApp, type TestCtx, tokenFor } from './helpers';

let t: TestCtx;
type U = Awaited<ReturnType<typeof makeUser>>;
let alice: U, bob: U, eve: U, gina: U;
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` });

beforeAll(async () => {
  t = await setupApp();
  alice = await makeUser(t, 'alice@example.com', 'Alice');
  bob = await makeUser(t, 'bob@example.com', 'Bob');
  eve = await makeUser(t, 'eve@example.com', 'Eve');
  gina = await makeUser(t, 'gina@example.com', 'Gina');
});
afterAll(async () => t?.teardown());

describe('health', () => {
  it('reporta banco e redis', async () => {
    const r = await request(t.http).get('/health').expect(200);
    expect(r.body).toMatchObject({ status: 'ok', checks: { database: 'ok', redis: 'ok' } });
    expect(r.headers['x-request-id']).toBeTruthy();
  });
});

describe('autenticação', () => {
  it('rejeita sem token, token inválido, expirado, assinado com outro segredo ou outra audiência', async () => {
    await request(t.http).get('/me').expect(401);
    await request(t.http).get('/me').set('Authorization', 'Bearer abc.def.ghi').expect(401);
    const expired = await tokenFor(alice.id, alice.email, { exp: '-1m' });
    await request(t.http).get('/me').set('Authorization', `Bearer ${expired}`).expect(401);
    const forged = await tokenFor(alice.id, alice.email, { secret: 'x'.repeat(40) });
    await request(t.http).get('/me').set('Authorization', `Bearer ${forged}`).expect(401);
    const wrongAud = await tokenFor(alice.id, alice.email, { aud: 'anon' });
    await request(t.http).get('/me').set('Authorization', `Bearer ${wrongAud}`).expect(401);
  });

  it('erro tem formato padronizado', async () => {
    const r = await request(t.http).get('/me').expect(401);
    expect(r.body.error).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(r.body.error.requestId).toBeTruthy();
  });

  it('token de usuário inexistente é rejeitado', async () => {
    const ghost = await tokenFor('00000000-0000-4000-8000-000000000000', 'ghost@x.com');
    await request(t.http).get('/me').set('Authorization', `Bearer ${ghost}`).expect(401);
  });
});

describe('perfil', () => {
  it('lê e atualiza o próprio perfil', async () => {
    const r = await request(t.http).get('/me').set(auth(alice)).expect(200);
    expect(r.body).toMatchObject({ email: 'alice@example.com', displayName: 'Alice', locale: 'pt-BR' });
    const u = await request(t.http)
      .patch('/me')
      .set(auth(alice))
      .send({ displayName: 'Alice, a Sábia' })
      .expect(200);
    expect(u.body.displayName).toBe('Alice, a Sábia');
    await request(t.http).patch('/me').set(auth(alice)).send({ displayName: '' }).expect(400);
    await request(t.http).patch('/me').set(auth(alice)).send({}).expect(400);
  });

  it('lista organização pessoal', async () => {
    const r = await request(t.http).get('/organizations').set(auth(alice)).expect(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({ isPersonal: true, role: 'owner' });
  });
});

describe('campanhas, convites e permissões', () => {
  let campaignId: string;
  let token: string;

  it('cria campanha com validação', async () => {
    await request(t.http).post('/campaigns').set(auth(alice)).send({ name: '' }).expect(400);
    await request(t.http)
      .post('/campaigns')
      .set(auth(alice))
      .send({ name: 'X', gmMode: 'robot' })
      .expect(400);
    const r = await request(t.http)
      .post('/campaigns')
      .set(auth(alice))
      .send({ name: 'A Torre Sombria', description: 'Uma campanha de horror', gmMode: 'assistant' })
      .expect(201);
    expect(r.body).toMatchObject({
      name: 'A Torre Sombria',
      gmMode: 'assistant',
      myRole: 'owner',
      memberCount: 1,
    });
    campaignId = r.body.id;
    const list = await request(t.http).get('/campaigns').set(auth(alice)).expect(200);
    expect(list.body.map((c: { id: string }) => c.id)).toContain(campaignId);
  });

  it('estranho não vê, não altera, não lista membros (404, sem revelar existência)', async () => {
    await request(t.http).get(`/campaigns/${campaignId}`).set(auth(eve)).expect(404);
    await request(t.http).patch(`/campaigns/${campaignId}`).set(auth(eve)).send({ name: 'hack' }).expect(404);
    await request(t.http).get(`/campaigns/${campaignId}/members`).set(auth(eve)).expect(404);
    await request(t.http).post(`/campaigns/${campaignId}/invitations`).set(auth(eve)).send({}).expect(404);
    await request(t.http).delete(`/campaigns/${campaignId}`).set(auth(eve)).expect(404);
    const list = await request(t.http).get('/campaigns').set(auth(eve)).expect(200);
    expect(list.body).toHaveLength(0);
    await request(t.http).get('/campaigns/not-a-uuid').set(auth(eve)).expect(404);
  });

  it('dono cria convite; token só aparece na criação e é guardado como hash', async () => {
    const r = await request(t.http)
      .post(`/campaigns/${campaignId}/invitations`)
      .set(auth(alice))
      .send({ role: 'player' })
      .expect(201);
    token = r.body.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [row] = await t.sql`select token_hash from campaign_invitations where id = ${r.body.id}`;
    expect(row!.token_hash).not.toBe(token);
    const list = await request(t.http)
      .get(`/campaigns/${campaignId}/invitations`)
      .set(auth(alice))
      .expect(200);
    expect(list.body[0].token).toBeUndefined();
  });

  it('convidado aceita e passa a ver a campanha; convite não reutilizável', async () => {
    const r = await request(t.http).post(`/invitations/${token}/accept`).set(auth(bob)).expect(200);
    expect(r.body).toMatchObject({ campaignId, role: 'player', alreadyMember: false });
    const c = await request(t.http).get(`/campaigns/${campaignId}`).set(auth(bob)).expect(200);
    expect(c.body).toMatchObject({ myRole: 'player', memberCount: 2 });
    await request(t.http).post(`/invitations/${token}/accept`).set(auth(eve)).expect(400);
    await request(t.http)
      .post(`/invitations/${'a'.repeat(43)}/accept`)
      .set(auth(eve))
      .expect(400);
    await request(t.http).post(`/invitations/bad/accept`).set(auth(eve)).expect(400);
  });

  it('convite por e-mail só serve para aquele e-mail', async () => {
    const r = await request(t.http)
      .post(`/campaigns/${campaignId}/invitations`)
      .set(auth(alice))
      .send({ role: 'gm', email: 'GINA@example.com' })
      .expect(201);
    await request(t.http).post(`/invitations/${r.body.token}/accept`).set(auth(eve)).expect(400);
    const ok = await request(t.http).post(`/invitations/${r.body.token}/accept`).set(auth(gina)).expect(200);
    expect(ok.body.role).toBe('gm');
  });

  it('convite revogado ou expirado não funciona', async () => {
    const r1 = await request(t.http)
      .post(`/campaigns/${campaignId}/invitations`)
      .set(auth(alice))
      .send({})
      .expect(201);
    await request(t.http)
      .delete(`/campaigns/${campaignId}/invitations/${r1.body.id}`)
      .set(auth(alice))
      .expect(204);
    await request(t.http).post(`/invitations/${r1.body.token}/accept`).set(auth(eve)).expect(400);
    const r2 = await request(t.http)
      .post(`/campaigns/${campaignId}/invitations`)
      .set(auth(alice))
      .send({})
      .expect(201);
    await t.sql`update campaign_invitations set expires_at = now() - interval '1 minute' where id = ${r2.body.id}`;
    await request(t.http).post(`/invitations/${r2.body.token}/accept`).set(auth(eve)).expect(400);
  });

  it('jogador não gerencia; mestre gerencia com limites', async () => {
    await request(t.http).patch(`/campaigns/${campaignId}`).set(auth(bob)).send({ name: 'x' }).expect(403);
    await request(t.http).post(`/campaigns/${campaignId}/invitations`).set(auth(bob)).send({}).expect(403);
    await request(t.http).get(`/campaigns/${campaignId}/invitations`).set(auth(bob)).expect(403);
    await request(t.http)
      .patch(`/campaigns/${campaignId}/members/${bob.id}`)
      .set(auth(bob))
      .send({ role: 'gm' })
      .expect(403);
    // Gina é mestre: pode editar campanha e convidar jogadores, mas não mestres
    await request(t.http)
      .patch(`/campaigns/${campaignId}`)
      .set(auth(gina))
      .send({ description: 'atualizada' })
      .expect(200);
    await request(t.http)
      .post(`/campaigns/${campaignId}/invitations`)
      .set(auth(gina))
      .send({ role: 'gm' })
      .expect(403);
    await request(t.http)
      .patch(`/campaigns/${campaignId}/members/${bob.id}`)
      .set(auth(gina))
      .send({ role: 'gm' })
      .expect(403);
    await request(t.http)
      .patch(`/campaigns/${campaignId}/members/${bob.id}`)
      .set(auth(gina))
      .send({ role: 'spectator' })
      .expect(204);
    await request(t.http)
      .patch(`/campaigns/${campaignId}/members/${alice.id}`)
      .set(auth(gina))
      .send({ role: 'player' })
      .expect(403);
    await request(t.http).delete(`/campaigns/${campaignId}`).set(auth(gina)).expect(403);
  });

  it('membros listados com nomes e papéis', async () => {
    const r = await request(t.http).get(`/campaigns/${campaignId}/members`).set(auth(bob)).expect(200);
    const roles = Object.fromEntries(
      r.body.map((m: { displayName: string; role: string }) => [m.displayName, m.role]),
    );
    expect(roles).toMatchObject({ 'Alice, a Sábia': 'owner', Bob: 'spectator', Gina: 'gm' });
  });

  it('membro pode sair; dono não pode ser removido', async () => {
    await request(t.http).delete(`/campaigns/${campaignId}/members/${alice.id}`).set(auth(alice)).expect(403);
    await request(t.http).delete(`/campaigns/${campaignId}/members/${bob.id}`).set(auth(bob)).expect(204);
    await request(t.http).get(`/campaigns/${campaignId}`).set(auth(bob)).expect(404);
  });

  it('toda alteração gera auditoria com o ator correto', async () => {
    const rows = await t.sql<{ action: string; actor_id: string }[]>`
      select action, actor_id from audit_logs where campaign_id = ${campaignId} order by id`;
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'campaign.created',
        'invitation.created',
        'invitation.accepted',
        'invitation.revoked',
        'campaign.updated',
        'member.role_changed',
        'member.left',
      ]),
    );
    expect(rows.find((r) => r.action === 'campaign.created')!.actor_id).toBe(alice.id);
    expect(rows.find((r) => r.action === 'campaign.updated')!.actor_id).toBe(gina.id);
    const leak = await t.sql`select 1 from audit_logs where after::text like ${'%' + token + '%'}`;
    expect(leak).toHaveLength(0);
  });

  it('dono exclui (exclusão lógica) e ninguém mais vê', async () => {
    await request(t.http).delete(`/campaigns/${campaignId}`).set(auth(alice)).expect(204);
    await request(t.http).get(`/campaigns/${campaignId}`).set(auth(alice)).expect(404);
    await request(t.http).get(`/campaigns/${campaignId}`).set(auth(gina)).expect(404);
    const [row] = await t.sql`select deleted_at from campaigns where id = ${campaignId}`;
    expect(row!.deleted_at).not.toBeNull();
  });
});
