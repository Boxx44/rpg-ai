import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeUser, setupApp, type TestCtx } from './helpers';

/** Hospedagem gratuita sem Redis: a API precisa funcionar do mesmo jeito. */
let t: TestCtx;
beforeAll(async () => {
  t = await setupApp({ REDIS_URL: '', RATE_LIMIT_PER_MINUTE: '3' });
});
afterAll(async () => t?.teardown());

describe('sem Redis', () => {
  it('health fica ok com redis "disabled"', async () => {
    const r = await request(t.http).get('/health').expect(200);
    expect(r.body).toMatchObject({ status: 'ok', checks: { database: 'ok', redis: 'disabled' } });
  });

  it('limite de requisições continua funcionando (em memória)', async () => {
    const u = await makeUser(t, 'nr@example.com');
    for (let i = 0; i < 3; i++)
      await request(t.http).get('/me').set('Authorization', `Bearer ${u.token}`).expect(200);
    await request(t.http).get('/me').set('Authorization', `Bearer ${u.token}`).expect(429);
  });
});
