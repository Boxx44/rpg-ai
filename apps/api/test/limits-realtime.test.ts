import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeUser, setupApp, type TestCtx } from './helpers';

let t: TestCtx;
let port: number;

beforeAll(async () => {
  t = await setupApp({ RATE_LIMIT_PER_MINUTE: '5' });
  await t.created.app.listen(0);
  port = (t.http.address() as { port: number }).port;
});
afterAll(async () => t?.teardown());

describe('rate limit', () => {
  it('retorna 429 com mensagem clara após o limite', async () => {
    const u = await makeUser(t, 'rl@example.com');
    for (let i = 0; i < 5; i++)
      await request(t.http).get('/me').set('Authorization', `Bearer ${u.token}`).expect(200);
    const r = await request(t.http).get('/me').set('Authorization', `Bearer ${u.token}`).expect(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
    expect(r.headers['retry-after']).toBeTruthy();
    // outro usuário não é afetado
    const v = await makeUser(t, 'rl2@example.com');
    await request(t.http).get('/me').set('Authorization', `Bearer ${v.token}`).expect(200);
  });

  it('health não é limitado', async () => {
    for (let i = 0; i < 8; i++) await request(t.http).get('/health').expect(200);
  });
});

describe('corpo da requisição', () => {
  it('rejeita corpo grande demais', async () => {
    const u = await makeUser(t, 'big@example.com');
    await request(t.http)
      .post('/campaigns')
      .set('Authorization', `Bearer ${u.token}`)
      .send({ name: 'x', description: 'a'.repeat(300_000) })
      .expect(413);
  });

  it('rejeita JSON malformado com 400', async () => {
    const u = await makeUser(t, 'badjson@example.com');
    const r = await request(t.http)
      .post('/campaigns')
      .set('Authorization', `Bearer ${u.token}`)
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('websocket', () => {
  const connect = (token?: string) =>
    new Promise<{ event: string; payload: unknown; socket: Socket }>((resolve) => {
      const s = io(`http://localhost:${port}/realtime`, {
        auth: token ? { token } : {},
        transports: ['websocket'],
      });
      s.on('session.ready', (p) => resolve({ event: 'ready', payload: p, socket: s }));
      s.on('session.error', (p) => resolve({ event: 'error', payload: p, socket: s }));
    });

  it('aceita conexão autenticada', async () => {
    const u = await makeUser(t, 'ws@example.com');
    const r = await connect(u.token);
    expect(r.event).toBe('ready');
    expect(r.payload).toEqual({ userId: u.id });
    r.socket.close();
  });

  it('recusa conexão sem token válido', async () => {
    const r = await connect('invalid');
    expect(r.event).toBe('error');
    r.socket.close();
  });
});
