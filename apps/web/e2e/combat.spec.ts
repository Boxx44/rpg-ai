import { type Browser, expect, type Page, test } from '@playwright/test';

/** Combate: iniciativa, turnos, PV, condições e inimigos ocultos, com mestre e jogadora ao mesmo tempo. */
const stamp = Date.now();
const gm = { name: 'Mestra Combate', email: `cgm${stamp}@example.com`, password: 'senha-forte-555' };
const pl = { name: 'Jogadora Combate', email: `cpl${stamp}@example.com`, password: 'senha-forte-666' };

test.describe.configure({ mode: 'serial' });

let gmPage: Page;
let plPage: Page;
let base = '';

async function newUser(browser: Browser, u: typeof gm, path = '/register') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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
const row = (p: Page, name: string) => p.locator(`[data-testid="combatant"][data-name="${name}"]`);
const openCombat = (p: Page) => p.getByRole('tab', { name: /Combate/ }).click();

test('preparação: campanha, convite e personagem', async ({ browser }) => {
  gmPage = await newUser(browser, gm);
  await gmPage.getByRole('link', { name: 'Nova campanha' }).click();
  await gmPage.getByLabel('Nome da campanha').fill('Sangue no Porão');
  await gmPage.getByRole('button', { name: 'Criar campanha' }).click();
  await expect(gmPage.getByTestId('campaign-title')).toHaveText('Sangue no Porão');
  base = new URL(gmPage.url()).pathname;
  await gmPage.goto(`${base}/manage`);
  // Ordem Paranormal traz a lista de condições do livro.
  await gmPage.getByRole('button', { name: /Usar Ordem Paranormal RPG/ }).click();
  await expect(gmPage.getByRole('heading', { name: 'Ordem Paranormal RPG' })).toBeVisible();
  await gmPage.goto(`${base}/manage`);
  await expect(gmPage.getByTestId('system-panel')).toContainText('Ordem Paranormal RPG');
  await gmPage.getByRole('button', { name: 'Gerar link' }).click();
  const link = await gmPage.getByTestId('invite-link').inputValue();
  plPage = await newUser(browser, pl, new URL(link).pathname);
  await plPage.getByRole('button', { name: 'Aceitar convite' }).click();
  await expect(plPage.getByTestId('campaign-title')).toHaveText('Sangue no Porão');
  await plPage.goto(`${base}/characters`);
  await plPage.getByRole('button', { name: 'Novo personagem' }).click();
  await plPage.getByLabel('Nome', { exact: true }).fill('Kara');
  await plPage.getByRole('button', { name: 'Salvar ficha' }).click();
  await expect(plPage.getByTestId('character-card')).toContainText('Kara');
});

test('mestre inicia o combate e coloca inimigos (um oculto)', async () => {
  await gmPage.goto(base);
  await openCombat(gmPage);
  await gmPage.getByRole('button', { name: 'Iniciar combate' }).click();
  await expect(row(gmPage, 'Kara')).toBeVisible();
  await gmPage.getByLabel('Nome do inimigo').fill('Zumbi');
  await gmPage.getByLabel('PV do combatente').fill('12');
  await gmPage.getByLabel('Quantos inimigos').fill('2');
  await gmPage.getByRole('button', { name: 'Adicionar' }).click();
  await expect(row(gmPage, 'Zumbi 2')).toContainText('12/12 PV');
  await gmPage.getByLabel('Nome do inimigo').fill('Vulto');
  await gmPage.getByLabel('Quantos inimigos').fill('1');
  await gmPage.getByLabel('Oculto dos jogadores').check();
  await gmPage.getByRole('button', { name: 'Adicionar' }).click();
  await expect(row(gmPage, 'Vulto')).toContainText('(oculto)');
});

test('jogadora vê o combate sem o oculto e rola a própria Iniciativa', async () => {
  await plPage.goto(base);
  await expect(plPage.getByTestId('combat-banner')).toContainText('Rodada 1');
  await openCombat(plPage);
  await expect(plPage.getByTestId('combatant')).toHaveCount(3);
  await expect(row(plPage, 'Vulto')).toHaveCount(0);
  await expect(row(plPage, 'Zumbi 1').getByTestId('health')).toHaveText('Ileso');
  await expect(row(plPage, 'Zumbi 1').getByRole('button', { name: 'Iniciativa' })).toHaveCount(0);
  await row(plPage, 'Kara').getByRole('button', { name: 'Iniciativa' }).click();
  await expect(row(plPage, 'Kara').getByTestId('initiative')).toHaveText(/^\d+$/);
  await expect(row(gmPage, 'Kara').getByTestId('initiative')).toHaveText(/^\d+$/);
});

test('turnos: mestre começa; jogadora passa a própria vez', async () => {
  for (const [n, v] of [
    ['Zumbi 1', '50'],
    ['Zumbi 2', '-5'],
    ['Vulto', '-9'],
  ] as const) {
    const input = gmPage.getByLabel(`Definir Iniciativa de ${n}`);
    await input.fill(v);
    await input.press('Enter');
    await expect(row(gmPage, n).getByTestId('initiative')).toHaveText(v);
  }
  await gmPage.getByRole('button', { name: 'Começar' }).click();
  await expect(plPage.getByTestId('turn-of')).toContainText('Zumbi 1');
  await gmPage.getByTestId('combat-banner').getByRole('button', { name: 'Próximo turno' }).click();
  await expect(plPage.getByTestId('turn-of')).toContainText('sua vez!');
  await plPage.getByRole('button', { name: 'Encerrar meu turno' }).click();
  await expect(plPage.getByTestId('turn-of')).toContainText('Zumbi 2');
  await gmPage.getByTestId('combat-banner').getByRole('button', { name: 'Próximo turno' }).click();
  await expect(plPage.getByTestId('combat-banner')).toContainText('Vez do mestre');
  await gmPage.getByTestId('combat-banner').getByRole('button', { name: 'Próximo turno' }).click();
  await expect(plPage.getByTestId('combat-banner')).toContainText('Rodada 2');
});

test('dano, cura e condições aparecem para todos', async () => {
  await gmPage.getByLabel('Quantidade de PV para Zumbi 1').fill('12');
  await gmPage.getByRole('button', { name: 'Dano em Zumbi 1' }).click();
  await expect(row(plPage, 'Zumbi 1').getByTestId('health')).toHaveText('Caído');
  await plPage.getByLabel('Quantidade de PV para Kara').fill('3');
  await plPage.getByRole('button', { name: 'Dano em Kara' }).click();
  await expect(row(gmPage, 'Kara').getByTestId('health')).toHaveText('18/21 PV');
  await gmPage.getByLabel('Adicionar condição a Kara').selectOption({ label: 'Caído' });
  const chip = row(plPage, 'Kara').getByTestId('condition');
  await expect(chip).toHaveText('Caído');
  await expect(chip).toHaveAttribute('title', /p\. 320/);
  await plPage.screenshot({ path: 'test-results/screens/combat-player.png', fullPage: true });
  await gmPage.screenshot({ path: 'test-results/screens/combat-gm.png', fullPage: true });
});

test('mestre encerra o combate', async () => {
  await gmPage.getByRole('button', { name: 'Encerrar combate' }).click();
  await gmPage.getByRole('button', { name: 'Confirmar fim' }).click();
  await expect(plPage.getByTestId('combat-banner')).toHaveCount(0);
  await expect(plPage.getByText('Nenhum combate em andamento.')).toBeVisible();
});
