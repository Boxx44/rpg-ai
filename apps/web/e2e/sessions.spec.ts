import { type Browser, expect, type Page, test } from '@playwright/test';

/**
 * Preparar x Jogar: o mestre prepara mapas, inicia a sessão ao vivo,
 * o jogador recebe o aviso, segue o mapa escolhido pelo mestre e
 * a sessão termina com resumo no histórico.
 */
const stamp = Date.now();
const gm = { name: 'Mestre Sessões', email: `sgm${stamp}@example.com`, password: 'senha-forte-333' };
const pl = { name: 'Jogadora Sessões', email: `spl${stamp}@example.com`, password: 'senha-forte-444' };

test.describe.configure({ mode: 'serial' });

let gmPage: Page;
let plPage: Page;
let base = '';

async function newUser(browser: Browser, u: typeof gm, path = '/register') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(path);
  if (!page.url().includes('/register')) await page.getByRole('link', { name: 'Criar conta' }).click();
  await page.getByLabel('Nome de exibição').fill(u.name);
  await page.getByLabel('E-mail').fill(u.email);
  await page.getByLabel('Senha', { exact: true }).fill(u.password);
  await page.getByLabel('Confirmar senha').fill(u.password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  return page;
}

async function createMap(name: string) {
  await gmPage.goto(`${base}/maps`);
  await gmPage.getByLabel('Nome do mapa').fill(name);
  await gmPage.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(gmPage.getByTestId('map-canvas')).toBeVisible();
}

test('mestre prepara a campanha e convida a jogadora', async ({ browser }) => {
  gmPage = await newUser(browser, gm);
  await gmPage.getByRole('link', { name: 'Nova campanha' }).click();
  await gmPage.getByLabel('Nome da campanha').fill('Noite na Estação');
  await gmPage.getByRole('button', { name: 'Criar campanha' }).click();
  await expect(gmPage.getByTestId('campaign-title')).toHaveText('Noite na Estação');
  base = new URL(gmPage.url()).pathname;
  await expect(gmPage.getByText('Preparar', { exact: true })).toBeVisible();
  await createMap('Plataforma');
  await createMap('Túnel');

  await gmPage.goto(`${base}/manage`);
  await gmPage.getByRole('button', { name: 'Gerar link' }).click();
  const link = await gmPage.getByTestId('invite-link').inputValue();
  plPage = await newUser(browser, pl, new URL(link).pathname);
  await plPage.getByRole('button', { name: 'Aceitar convite' }).click();
  await expect(plPage.getByTestId('session-bar')).toContainText('Aguardando o mestre iniciar a sessão');
  await plPage.goto('/dashboard');
});

test('mestre inicia a sessão e a jogadora recebe o aviso em outra página', async () => {
  await gmPage.goto(base);
  await gmPage.getByLabel('Título da sessão').fill('O último trem');
  await gmPage.getByRole('button', { name: 'Iniciar sessão' }).click();
  await expect(gmPage.getByTestId('session-title')).toHaveText('Sessão 1 ao vivo · O último trem');

  const toast = plPage.getByTestId('live-toast');
  await expect(toast).toContainText('Noite na Estação');
  await toast.getByRole('link', { name: 'Entrar na mesa' }).click();
  await expect(plPage.getByTestId('session-bar')).toHaveAttribute('data-live', 'true');
  await expect(plPage.getByTestId('live-tab-badge')).toBeVisible();
});

test('mestre escolhe o mapa da cena e a jogadora acompanha', async () => {
  await gmPage.getByLabel('Mapa para todos').selectOption({ label: 'Mostrar a todos: Túnel' });
  await expect(plPage.getByTestId('scene-name')).toContainText('Túnel');
  await gmPage.getByLabel('Mapa para todos').selectOption({ label: 'Mostrar a todos: Plataforma' });
  await expect(plPage.getByTestId('scene-name')).toContainText('Plataforma');
  await plPage.screenshot({ path: 'test-results/screens/session-live.png', fullPage: true });
});

test('mensagens entram na sessão; mestre encerra com resumo', async () => {
  const input = plPage.getByLabel('Mensagem ou rolagem');
  await input.fill('Entro no vagão com cuidado.');
  await input.press('Enter');
  await expect(gmPage.getByText('Entro no vagão com cuidado.')).toBeVisible();

  await gmPage.getByRole('button', { name: 'Encerrar', exact: true }).click();
  await gmPage.getByLabel('Resumo da sessão').fill('O grupo embarcou no último trem.');
  await gmPage.getByRole('button', { name: 'Encerrar sessão' }).click();
  await expect(gmPage.getByTestId('session-bar')).toHaveAttribute('data-live', 'false');
  await expect(plPage.getByTestId('session-bar')).toHaveAttribute('data-live', 'false');
});

test('histórico mostra a sessão, o resumo e a crônica', async () => {
  await plPage
    .getByRole('navigation', { name: 'Seções da campanha' })
    .getByRole('link', { name: 'Sessões' })
    .click();
  const card = plPage.getByTestId('session-card');
  await expect(card).toContainText('O último trem');
  await expect(card).toContainText('O grupo embarcou no último trem.');
  await card.getByRole('button', { name: 'Crônica' }).click();
  await expect(plPage.getByTestId('session-chronicle')).toContainText('Entro no vagão com cuidado.');
});
