/**
 * Testes de segurança no nível do banco (Row Level Security).
 * Simulam o que um usuário conseguiria fazer mesmo acessando o banco direto
 * pela Data API do Supabase, sem passar pela nossa API.
 */
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/migrate';
import { createAuthUser, createTestDatabase } from '../src/testing';

let drop: () => Promise<void>;
let url: string;
let sql: postgres.Sql;
let alice: string, bob: string, eve: string;
let campaignId: string;

async function as<T>(uid: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let out: T;
  try {
    await sql.begin(async (tx) => {
      if (uid) {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: 'authenticated' })}, true)`;
        await tx`set local role authenticated`;
      } else {
        await tx`set local role anon`;
      }
      out = await fn(tx);
      throw new RollbackSignal();
    });
  } catch (e) {
    if (!(e instanceof RollbackSignal)) throw e;
  }
  return out!;
}
class RollbackSignal extends Error {}

beforeAll(async () => {
  ({ url, drop } = await createTestDatabase('rpg_rls'));
  sql = postgres(url, { max: 2, onnotice: () => undefined });
  alice = await createAuthUser(sql, 'alice@example.com', { display_name: 'Alice' });
  bob = await createAuthUser(sql, 'bob@example.com', { full_name: 'Bob Bard' });
  eve = await createAuthUser(sql, 'eve@example.com');

  // Alice cria uma campanha como usuária autenticada (caminho real da API).
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: alice })}, true)`;
    await tx`set local role authenticated`;
    const [org] = await tx<{ id: string }[]>`select id from organizations where owner_id = ${alice}`;
    const [c] = await tx<{ id: string }[]>`
      insert into campaigns (organization_id, created_by, name) values (${org!.id}, ${alice}, 'Sombras') returning id`;
    campaignId = c!.id;
    await tx`insert into campaign_members (campaign_id, user_id, role) values (${campaignId}, ${alice}, 'owner')`;
  });
  // Bob entra como jogador (inserção privilegiada para preparar o cenário).
  await sql`insert into campaign_members (campaign_id, user_id, role) values (${campaignId}, ${bob}, 'player') on conflict do nothing`;
});

afterAll(async () => {
  await sql?.end();
  await drop?.();
});

describe('novo usuário', () => {
  it('trigger cria perfil, organização pessoal e vínculo de dono', async () => {
    const [p] = await sql`select display_name from user_profiles where user_id = ${bob}`;
    expect(p!.display_name).toBe('Bob Bard');
    const [o] = await sql`select o.is_personal, m.role from organizations o
      join organization_members m on m.organization_id = o.id where o.owner_id = ${eve}`;
    expect(o).toMatchObject({ is_personal: true, role: 'owner' });
    const [e] = await sql`select display_name from user_profiles where user_id = ${eve}`;
    expect(e!.display_name).toBe('eve');
  });
});

describe('isolamento de campanhas', () => {
  it('membros veem a campanha; estranhos não', async () => {
    expect(await as(alice, (tx) => tx`select id from campaigns`)).toHaveLength(1);
    expect(await as(bob, (tx) => tx`select id from campaigns`)).toHaveLength(1);
    expect(await as(eve, (tx) => tx`select id from campaigns`)).toHaveLength(0);
  });

  it('anônimo não lê nada', async () => {
    await expect(as(null, (tx) => tx`select id from campaigns`)).rejects.toThrow(/permission denied/);
    await expect(as(null, (tx) => tx`select id from users`)).rejects.toThrow(/permission denied/);
  });

  it('estranho não consegue alterar a campanha', async () => {
    const r = await as(
      eve,
      (tx) => tx`update campaigns set name = 'hack' where id = ${campaignId} returning id`,
    );
    expect(r).toHaveLength(0);
  });

  it('jogador não consegue alterar a campanha', async () => {
    const r = await as(
      bob,
      (tx) => tx`update campaigns set name = 'hack' where id = ${campaignId} returning id`,
    );
    expect(r).toHaveLength(0);
  });

  it('estranho não consegue se inserir como membro', async () => {
    await expect(
      as(
        eve,
        (tx) =>
          tx`insert into campaign_members (campaign_id, user_id, role) values (${campaignId}, ${eve}, 'player')`,
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(
        eve,
        (tx) =>
          tx`insert into campaign_members (campaign_id, user_id, role) values (${campaignId}, ${eve}, 'owner')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('jogador não consegue se promover', async () => {
    const r = await as(
      bob,
      (tx) =>
        tx`update campaign_members set role = 'gm' where campaign_id = ${campaignId} and user_id = ${bob} returning role`,
    );
    expect(r).toHaveLength(0);
  });

  it('ninguém remove o dono', async () => {
    const r = await as(
      alice,
      (tx) =>
        tx`delete from campaign_members where campaign_id = ${campaignId} and user_id = ${alice} returning user_id`,
    );
    expect(r).toHaveLength(0);
  });

  it('jogador não vê convites', async () => {
    expect(await as(bob, (tx) => tx`select id from campaign_invitations`)).toHaveLength(0);
  });

  it('perfis: visíveis só para quem divide campanha', async () => {
    expect(
      await as(bob, (tx) => tx`select user_id from user_profiles where user_id = ${alice}`),
    ).toHaveLength(1);
    expect(
      await as(eve, (tx) => tx`select user_id from user_profiles where user_id = ${alice}`),
    ).toHaveLength(0);
  });

  it('e-mail de outros usuários nunca é visível', async () => {
    expect(await as(bob, (tx) => tx`select email from users`)).toHaveLength(1);
  });

  it('só o dono apaga a campanha (exclusão lógica)', async () => {
    const [r1] = await as(bob, (tx) => tx`select app_private.soft_delete_campaign(${campaignId}) as ok`);
    expect(r1!.ok).toBe(false);
    const [r2] = await as(alice, (tx) => tx`select app_private.soft_delete_campaign(${campaignId}) as ok`);
    expect(r2!.ok).toBe(true);
  });
});

describe('auditoria', () => {
  it('usuário não consegue inserir auditoria direta nem forjar ator', async () => {
    await expect(
      as(
        eve,
        (tx) => tx`insert into audit_logs (actor_type, action, entity_type) values ('system', 'x', 'y')`,
      ),
    ).rejects.toThrow(/permission denied/);
    const rows = await as(eve, async (tx) => {
      await tx`select app_private.write_audit('test', 't', null, null, null, null, null, null, null)`;
      return tx`select actor_id from audit_logs where action = 'test'`;
    });
    expect(rows[0]!.actor_id).toBe(eve);
  });

  it('auditoria é imutável', async () => {
    await sql`insert into audit_logs (actor_type, action, entity_type) values ('system', 'imm', 't')`;
    await expect(sql`update audit_logs set action = 'x' where action = 'imm'`).rejects.toThrow(/append-only/);
    await expect(sql`delete from audit_logs where action = 'imm'`).rejects.toThrow(/append-only/);
  });
});

describe('migrations', () => {
  it('são idempotentes', async () => {
    const r = await migrate(url);
    expect(r.applied).toHaveLength(0);
  });
});
