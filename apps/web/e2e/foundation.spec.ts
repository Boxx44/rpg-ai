import { expect, type Page, test } from '@playwright/test';
import postgres from 'postgres';

/**
 * Fluxo de aceitação da Fase 1:
 * cadastro → painel → criar campanha → convidar → outro usuário aceita → ambos veem;
 * terceiro usuário não acessa; auditoria registrada.
 */
const DB = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/rpg_ai_e2e';
const stamp = Date.now();
const alice = { name: 'Alice Arcana', email: `alice${stamp}@example.com`, password: 'senha-forte-123' };
const bob = { name: 'Bob Bardo', email: `bob${stamp}@example.com`, password: 'senha-forte-456' };
const eve = { name: 'Eve Estranha', email: `eve${stamp}@example.com`, password: 'senha-forte-789' };
const CAMPAIGN = 'As Cinzas de Valdrak';

let campaignUrl = '';
let inviteLink = '';

async function register(page: Page, u: typeof alice) {
  await page.getByLabel('Nome de exibição').fill(u.name);
  await page.getByLabel('E-mail').fill(u.email);
  await page.getByLabel('Senha', { exact: true }).fill(u.password);
  await page.getByLabel('Confirmar senha').fill(u.password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/login/);
}

test.describe.configure({ mode: 'serial' });

test('páginas internas exigem login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/login-desktop.png', fullPage: true });
});

test('botão do Google aparece e informa quando não configurado', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeDisabled();
  await expect(page.getByText('Login com Google ainda não configurado')).toBeVisible();
});

test('cadastro valida campos', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Informe como quer ser chamado.')).toBeVisible();
  await expect(page.getByText('Mínimo de 8 caracteres.')).toBeVisible();
});

test('Alice se cadastra, vê o painel vazio e cria uma campanha', async ({ page }) => {
  await page.goto('/register');
  await register(page, alice);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText('Nenhuma campanha ainda')).toBeVisible();
  await expect(page.getByTestId('nav-profile')).toContainText(alice.name);
  await page.screenshot({ path: 'test-results/screens/dashboard-empty.png', fullPage: true });

  await page.getByRole('link', { name: 'Nova campanha' }).click();
  await page.getByRole('button', { name: 'Criar campanha' }).click();
  await expect(page.getByText('Dê um nome à campanha')).toBeVisible();
  await page.getByLabel('Nome da campanha').fill(CAMPAIGN);
  await page.getByLabel('Descrição').fill('Uma cidade em ruínas, um dragão adormecido e segredos antigos.');
  await page.getByRole('radio', { name: /Mestre humano \+ assistente/ }).click();
  await page.screenshot({ path: 'test-results/screens/new-campaign.png', fullPage: true });
  await page.getByRole('button', { name: 'Criar campanha' }).click();

  await expect(page.getByTestId('campaign-title')).toHaveText(CAMPAIGN);
  campaignUrl = page.url();
  await expect(page.getByTestId('members-list')).toContainText(alice.name);
});

test('Alice gera um link de convite', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(alice.email);
  await page.getByLabel('Senha').fill(alice.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByTestId('campaign-card').filter({ hasText: CAMPAIGN }).click();
  await page.getByRole('button', { name: 'Gerar link' }).click();
  inviteLink = await page.getByTestId('invite-link').inputValue();
  expect(inviteLink).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText('Convites pendentes')).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/campaign-owner.png', fullPage: true });
  await logout(page);
});

test('Bob abre o convite, cria conta e entra na campanha', async ({ page }) => {
  await page.goto(new URL(inviteLink).pathname);
  await expect(page).toHaveURL(/\/login\?next=%2Finvite%2F/);
  await page.getByRole('link', { name: 'Criar conta' }).click();
  await register(page, bob);
  await expect(page.getByRole('heading', { name: 'Você foi convocado' })).toBeVisible();
  await page.getByRole('button', { name: 'Aceitar convite' }).click();
  await expect(page.getByTestId('campaign-title')).toHaveText(CAMPAIGN);
  await expect(page.getByTestId('members-list')).toContainText(alice.name);
  await expect(page.getByTestId('members-list')).toContainText(bob.name);
  // Jogador não vê painéis de gestão
  await expect(page.getByText('Convidar jogadores')).toHaveCount(0);
  await page.goto('/dashboard');
  await expect(page.getByTestId('campaign-card')).toContainText(CAMPAIGN);
  await page.screenshot({ path: 'test-results/screens/dashboard-player.png', fullPage: true });
  await logout(page);
});

test('o mesmo convite não funciona duas vezes', async ({ page }) => {
  await page.goto('/register');
  await register(page, eve);
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto(new URL(inviteLink).pathname);
  await page.getByRole('button', { name: 'Aceitar convite' }).click();
  await expect(page.getByText(/Convite inválido/)).toBeVisible();
});

test('Eve (sem convite) não acessa a campanha', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(eve.email);
  await page.getByLabel('Senha').fill(eve.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId('campaign-card')).toHaveCount(0);
  await page.goto(new URL(campaignUrl).pathname);
  await expect(page.getByRole('heading', { name: 'Caminho perdido' })).toBeVisible();
  await expect(page.getByText(CAMPAIGN)).toHaveCount(0);
});

test('senha errada mostra mensagem clara', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(alice.email);
  await page.getByLabel('Senha').fill('senha-errada-000');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
});

test('auditoria registrou as ações', async () => {
  const sql = postgres(DB, { max: 1 });
  try {
    const rows = await sql<{ action: string }[]>`
      select a.action from audit_logs a join campaigns c on c.id = a.campaign_id where c.name = ${CAMPAIGN}`;
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining(['campaign.created', 'invitation.created', 'invitation.accepted']),
    );
  } finally {
    await sql.end();
  }
});
