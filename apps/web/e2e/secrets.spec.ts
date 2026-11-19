import { type Browser, expect, type Page, test } from '@playwright/test';
import { mapPoint } from './map-helpers';

/**
 * Segredos no mapa: o mestre esconde um baú (Percepção DT 1, alcance 3) e uma pistola
 * impossível de achar (DT 60). A jogadora usa "Procurar ao redor": acha só o baú, com
 * animação, e só ela vê. O mestre é avisado e vê quem descobriu.
 */
const stamp = Date.now();
const gm = { name: 'Tia Mestra', email: `sgm${stamp}@example.com`, password: 'senha-forte-909' };
const pl = { name: 'Cora Jogadora', email: `spl${stamp}@example.com`, password: 'senha-forte-808' };

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

test('preparação: campanha com Ordem Paranormal, jogadora e personagem', async ({ browser }) => {
  gmPage = await newUser(browser, gm);
  await gmPage.getByRole('link', { name: 'Nova campanha' }).click();
  await gmPage.getByLabel('Nome da campanha').fill('A Cripta');
  await gmPage.getByRole('button', { name: 'Criar campanha' }).click();
  await expect(gmPage.getByTestId('campaign-title')).toHaveText('A Cripta');
  base = new URL(gmPage.url()).pathname;
  await gmPage.goto(`${base}/manage`);
  await gmPage.getByRole('button', { name: /Usar Ordem Paranormal RPG/ }).click();
  await expect(gmPage.getByRole('heading', { name: 'Ordem Paranormal RPG' })).toBeVisible();
  await gmPage.goto(`${base}/manage`);
  await gmPage.getByRole('button', { name: 'Gerar link' }).click();
  const link = await gmPage.getByTestId('invite-link').inputValue();
  plPage = await newUser(browser, pl, new URL(link).pathname);
  await plPage.getByRole('button', { name: 'Aceitar convite' }).click();
  await expect(plPage.getByTestId('campaign-title')).toHaveText('A Cripta');
  await plPage.goto(`${base}/characters`);
  await plPage.getByRole('button', { name: 'Novo personagem' }).click();
  await plPage.getByLabel('Nome', { exact: true }).fill('Kara');
  await plPage.getByRole('button', { name: 'Salvar ficha' }).click();
  await expect(plPage.getByTestId('character-card')).toContainText('Kara');
});

test('mestre esconde um baú como segredo (Percepção DT 1) e uma pistola impossível', async () => {
  await gmPage.goto(`${base}/maps`);
  await gmPage.getByLabel('Nome do mapa').fill('Cripta');
  await gmPage.getByRole('button', { name: 'Criar mapa' }).click();
  const canvas = gmPage.getByTestId('map-canvas');
  await expect(canvas).toBeVisible();

  await gmPage.getByRole('button', { name: 'Colocar token' }).click();
  await gmPage.getByLabel('Vincular a').selectOption({ label: `Kara (${pl.name})` });
  let at = await mapPoint(canvas);
  await gmPage.mouse.click(at(60, 60).x, at(60, 60).y);
  await expect(gmPage.getByTestId('map-token')).toHaveCount(1);

  await gmPage.getByTestId('tool-props').click();
  const palette = gmPage.getByTestId('prop-palette');
  await palette.getByLabel('Oculto').check();
  await palette.getByRole('button', { name: 'Baú', exact: true }).click();
  at = await mapPoint(canvas);
  await gmPage.mouse.click(at(140, 100).x, at(140, 100).y);
  await palette.getByRole('button', { name: 'Pistola', exact: true }).click();
  at = await mapPoint(canvas);
  await gmPage.mouse.click(at(100, 140).x, at(100, 140).y);
  await expect(gmPage.getByTestId('map-prop')).toHaveCount(2);

  // configurar os segredos
  await gmPage.getByRole('button', { name: 'Mover', exact: true }).click();
  const setSecret = async (icon: string, dt: string) => {
    await gmPage.locator(`[data-icon="${icon}"]`).click();
    const panel = gmPage.getByTestId('secret-panel');
    await expect(panel).toBeVisible();
    await panel.getByLabel('Perícia que encontra').selectOption('percepcao');
    await panel.getByLabel('Dificuldade (DT)').fill(dt);
    await panel.getByLabel('Alcance (casas)').fill('3');
    await panel.getByTestId('secret-save').click();
    await expect(panel.getByTestId('secret-found-by')).toHaveText('Ninguém descobriu ainda.');
  };
  await setSecret('chest', '1');
  await setSecret('pistol', '60');

  await gmPage.getByTestId('toggle-share').click();
  await expect(gmPage.getByText('Na mesa')).toBeVisible();
});

test('jogadora procura ao redor: acha só o baú, com animação, e só ela vê', async () => {
  await gmPage.goto(base);
  await plPage.goto(base);
  await expect(plPage.getByTestId('rt-status')).toHaveAttribute('data-status', 'online');
  await expect(gmPage.getByTestId('rt-status')).toHaveAttribute('data-status', 'online');
  await expect(plPage.locator('[data-icon="chest"]')).toHaveCount(0);

  const search = plPage.getByTestId('search-around');
  await expect(search).toBeVisible();
  await expect(search.getByLabel('Perícia para procurar')).toHaveValue('percepcao');
  await search.getByRole('button', { name: 'Procurar ao redor' }).click();

  await expect(plPage.getByTestId('toast').filter({ hasText: 'Você encontrou: Baú' })).toBeVisible();
  await expect(plPage.locator('[data-icon="chest"]')).toHaveCount(1);
  await expect(plPage.getByTestId('discover-burst')).toHaveCount(1);
  await expect(plPage.locator('[data-icon="pistol"]')).toHaveCount(0);
  await plPage.screenshot({ path: 'test-results/screens/secret-found.png' });

  // a rolagem foi secreta: aparece na crônica dela
  await expect(plPage.getByTestId('chat-list')).toContainText('Kara: Percepção');

  // ela pode abrir o baú que achou
  await plPage.locator('[data-icon="chest"]').click();
  await expect(plPage.locator('[data-icon="chest"]')).toHaveAttribute('data-state', 'open');

  // o mestre é avisado e vê quem descobriu
  await expect(gmPage.getByTestId('toast').filter({ hasText: `${pl.name} encontrou algo` })).toBeVisible();
  await gmPage.goto(`${base}/maps`);
  await gmPage.getByRole('button', { name: 'Mover', exact: true }).click();
  await gmPage.locator('[data-icon="chest"]').click();
  await expect(gmPage.getByTestId('secret-found-by')).toContainText(pl.name);

  // procurar de novo não acha a pistola (DT 60)
  await plPage.getByTestId('search-around').getByRole('button', { name: 'Procurar ao redor' }).click();
  await expect(plPage.getByTestId('toast').filter({ hasText: 'não encontrou nada' })).toBeVisible();
  await expect(plPage.locator('[data-icon="pistol"]')).toHaveCount(0);
});
