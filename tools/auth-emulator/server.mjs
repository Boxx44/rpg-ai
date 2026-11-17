/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  EMULADOR LOCAL DO SUPABASE AUTH — SOMENTE DESENVOLVIMENTO E TESTES   ║
 * ║                                                                      ║
 * ║  Implementa o subconjunto da API do Supabase Auth (GoTrue) usado     ║
 * ║  pelo RPG AI: cadastro e login por e-mail/senha, renovação de        ║
 * ║  sessão, leitura/atualização do usuário e logout.                    ║
 * ║                                                                      ║
 * ║  NÃO implementa: envio de e-mails, login com Google, MFA, limites.   ║
 * ║  Em produção, o RPG AI usa um projeto Supabase real.                 ║
 * ║  Recusa-se a iniciar com NODE_ENV=production.                        ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import postgres from 'postgres';

if (process.env.NODE_ENV === 'production') {
  console.error('auth-emulator não pode rodar em produção.');
  process.exit(1);
}

const PORT = Number(process.env.AUTH_EMULATOR_PORT ?? 54321);
const SECRET = process.env.SUPABASE_JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
if (!SECRET || SECRET.length < 32) throw new Error('SUPABASE_JWT_SECRET (>= 32 caracteres) é obrigatório');
if (!DATABASE_URL) throw new Error('DATABASE_URL é obrigatório');

const sql = postgres(DATABASE_URL, { max: 4, onnotice: () => undefined });
const ACCESS_TTL = Number(process.env.AUTH_EMULATOR_ACCESS_TTL ?? 3600);
const ISS = `http://localhost:${PORT}/auth/v1`;
/** refresh token → { userId, sessionId } (memória; reiniciar o emulador encerra as sessões) */
const refreshTokens = new Map();

const b64u = (b) => Buffer.from(b).toString('base64url');
function signJwt(payload) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [h, b, s] = token.split('.');
  if (!h || !b || !s) return null;
  const expected = createHmac('sha256', SECRET).update(`${h}.${b}`).digest();
  const got = Buffer.from(s, 'base64url');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  return p.exp * 1000 > Date.now() ? p : null;
}
function hashPassword(pw) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(pw, salt, 32).toString('base64')}`;
}
function checkPassword(pw, stored) {
  const [alg, salt, hash] = (stored ?? '').split('$');
  if (alg !== 'scrypt') return false;
  const got = scryptSync(pw, Buffer.from(salt, 'base64'), 32);
  return timingSafeEqual(got, Buffer.from(hash, 'base64'));
}

function toUser(r) {
  return {
    id: r.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: r.email,
    email_confirmed_at: r.email_confirmed_at,
    confirmed_at: r.email_confirmed_at,
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: r.raw_user_meta_data ?? {},
    identities: [],
    created_at: r.created_at,
    updated_at: r.updated_at,
    is_anonymous: false,
  };
}
function issueSession(row) {
  const now = Math.floor(Date.now() / 1000);
  const sessionId = randomUUID();
  const user = toUser(row);
  const access = signJwt({
    iss: ISS,
    sub: row.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: row.email,
    session_id: sessionId,
    iat: now,
    exp: now + ACCESS_TTL,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
    aal: 'aal1',
    is_anonymous: false,
  });
  const refresh = randomBytes(24).toString('base64url');
  refreshTokens.set(refresh, { userId: row.id, sessionId });
  return {
    access_token: access,
    token_type: 'bearer',
    expires_in: ACCESS_TTL,
    expires_at: now + ACCESS_TTL,
    refresh_token: refresh,
    user,
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers':
    'authorization,apikey,content-type,x-client-info,x-supabase-api-version,x-retry-count',
};
function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', ...CORS });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
const fail = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
async function userFromBearer(req) {
  const t = (req.headers.authorization ?? '').replace(/^Bearer /i, '');
  const p = t && verifyJwt(t);
  if (!p) return null;
  const [row] = await sql`select * from auth.users where id = ${p.sub}`;
  return row ?? null;
}

const routes = {
  'GET /auth/v1/health': async (_q, res) =>
    send(res, 200, { name: 'rpg-ai-auth-emulator', version: 'local' }),
  'GET /auth/v1/settings': async (_q, res) =>
    send(res, 200, {
      external: { email: true, google: false },
      mailer_autoconfirm: true,
      disable_signup: false,
    }),
  'GET /auth/v1/.well-known/jwks.json': async (_q, res) => send(res, 200, { keys: [] }),

  'POST /auth/v1/signup': async (req, res) => {
    const { email, password, data } = await readBody(req);
    const e = String(email ?? '')
      .trim()
      .toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
      return fail(res, 400, 'validation_failed', 'Unable to validate email address: invalid format');
    if (typeof password !== 'string' || password.length < 8)
      return fail(res, 422, 'weak_password', 'Password should be at least 8 characters.');
    const [exists] = await sql`select 1 from auth.users where lower(email) = ${e}`;
    if (exists) return fail(res, 422, 'user_already_exists', 'User already registered');
    const [row] = await sql`
      insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at)
      values (${e}, ${hashPassword(password)}, ${sql.json(data ?? {})}, now()) returning *`;
    return send(res, 200, issueSession(row));
  },

  'POST /auth/v1/token': async (req, res, url) => {
    const body = await readBody(req);
    const grant = url.searchParams.get('grant_type');
    if (grant === 'password') {
      const [row] =
        await sql`select * from auth.users where lower(email) = ${String(body.email ?? '').toLowerCase()}`;
      if (!row || !checkPassword(String(body.password ?? ''), row.encrypted_password))
        return fail(res, 400, 'invalid_credentials', 'Invalid login credentials');
      return send(res, 200, issueSession(row));
    }
    if (grant === 'refresh_token') {
      const entry = refreshTokens.get(body.refresh_token);
      if (!entry)
        return fail(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      refreshTokens.delete(body.refresh_token);
      const [row] = await sql`select * from auth.users where id = ${entry.userId}`;
      if (!row) return fail(res, 400, 'user_not_found', 'User not found');
      return send(res, 200, issueSession(row));
    }
    return fail(res, 400, 'unsupported_grant_type', `grant_type não suportado pelo emulador: ${grant}`);
  },

  'GET /auth/v1/user': async (req, res) => {
    const row = await userFromBearer(req);
    if (!row) return fail(res, 401, 'bad_jwt', 'invalid JWT');
    return send(res, 200, toUser(row));
  },

  'PUT /auth/v1/user': async (req, res) => {
    const row = await userFromBearer(req);
    if (!row) return fail(res, 401, 'bad_jwt', 'invalid JWT');
    const { password, data } = await readBody(req);
    if (password !== undefined && (typeof password !== 'string' || password.length < 8))
      return fail(res, 422, 'weak_password', 'Password should be at least 8 characters.');
    const [u] = await sql`
      update auth.users set
        encrypted_password = coalesce(${password ? hashPassword(password) : null}, encrypted_password),
        raw_user_meta_data = raw_user_meta_data || ${sql.json(data ?? {})},
        updated_at = now()
      where id = ${row.id} returning *`;
    return send(res, 200, toUser(u));
  },

  'POST /auth/v1/logout': async (req, res) => {
    const row = await userFromBearer(req);
    if (row) for (const [k, v] of refreshTokens) if (v.userId === row.id) refreshTokens.delete(k);
    res.writeHead(204, CORS);
    res.end();
  },

  'POST /auth/v1/recover': async (req, res) => {
    const { email } = await readBody(req);
    console.warn(
      `[auth-emulator] Recuperação de senha solicitada para ${email}. O emulador NÃO envia e-mails.`,
    );
    return send(res, 200, {});
  },

  'GET /auth/v1/authorize': async (_req, res, url) => {
    const provider = url.searchParams.get('provider');
    res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
    res.end(
      `<p>Login com <b>${provider ?? '?'}</b> não está disponível no emulador local. ` +
        `Configure o provedor em um projeto Supabase real.</p><p><a href="${SITE_URL}/login">Voltar</a></p>`,
    );
  },
};

createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler)
      return fail(res, 404, 'not_found', `Rota não implementada no emulador: ${req.method} ${url.pathname}`);
    await handler(req, res, url);
  } catch (e) {
    console.error('[auth-emulator]', e);
    fail(res, 500, 'unexpected_failure', 'Erro interno do emulador');
  }
}).listen(PORT, () =>
  console.warn(`[auth-emulator] ouvindo em http://localhost:${PORT} (SOMENTE DESENVOLVIMENTO)`),
);
