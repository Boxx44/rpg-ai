import { type Browser, expect, type Page, test } from '@playwright/test';
import { mapPoint } from './map-helpers';

/**
 * Mesa "viva": preferências de acessibilidade, objetos no mapa (porta que abre,
 * tocha que acende) sincronizados entre mestre e jogador, e bandeja de dados animada.
 */
const stamp = Date.now();
const gm = { name: 'Vera Mestra', email: `vgm${stamp}@example.com`, password: 'senha-forte-333' };
const pl = { name: 'Rui Jogador', email: `vpl${stamp}@example.com`, password: 'senha-forte-444' };

test.describe.configure({ mode: 'serial' });

let gmPage: Page;
let plPage: Page;
let tableUrl = '';

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

test('preferências: texto maior, tema claro e menos movimento ficam salvos', async ({ browser }) => {
  gmPage = await newUser(browser, gm);
  await expect(gmPage).toHaveURL(/\/dashboard/);
  await gmPage.getByTestId('prefs-button').click();
  const menu = gmPage.getByTestId('prefs-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('radio', { name: 'A++' }).click();
  await menu.getByRole('radio', { name: 'Claro' }).click();
  await menu.getByRole('radio', { name: 'Menos movimento' }).click();
  const html = gmPage.locator('html');
  await expect(html).toHaveAttribute('data-text', 'xl');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(html).toHaveAttribute('data-motion', 'reduce');
  await gmPage.screenshot({ path: 'test-results/screens/prefs-light.png' });
  await gmPage.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // Continua aplicado depois de recarregar (script inicial, sem "piscar").
  await gmPage.reload();
  await expect(html).toHaveAttribute('data-text', 'xl');
  await expect(html).toHaveAttribute('data-theme', 'light');

  // Volta ao padrão para o resto dos testes.
  await gmPage.getByTestId('prefs-button').click();
  await menu.getByRole('radio', { name: 'A', exact: true }).click();
  await menu.getByRole('radio', { name: 'Escuro' }).click();
  await expect(html).not.toHaveAttribute('data-text', /.+/);
  await expect(html).not.toHaveAttribute('data-theme', /.+/);
  await gmPage.keyboard.press('Escape');

  // Atalho de teclado "Pular para o conteúdo"
  await gmPage.reload();
  await gmPage.keyboard.press('Tab');
  await expect(gmPage.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
});

test('mestre monta mapa com porta, tocha e baú', async ({ browser }) => {
  await gmPage.getByRole('link', { name: 'Nova campanha' }).click();
  await gmPage.getByLabel('Nome da campanha').fill('A Casa Viva');
  await gmPage.getByRole('button', { name: 'Criar campanha' }).click();
  await expect(gmPage.getByTestId('campaign-title')).toHaveText('A Casa Viva');
  tableUrl = new URL(gmPage.url()).pathname;
  await gmPage.getByRole('link', { name: 'Gerenciar' }).click();
  await gmPage.getByRole('button', { name: 'Gerar link' }).click();
  const link = await gmPage.getByTestId('invite-link').inputValue();
  plPage = await newUser(browser, pl, new URL(link).pathname);
  await plPage.getByRole('button', { name: 'Aceitar convite' }).click();
  await expect(plPage.getByTestId('campaign-title')).toHaveText('A Casa Viva');

  await gmPage.goto(`${tableUrl}/maps`);
  await gmPage.getByLabel('Nome do mapa').fill('Sala');
  await gmPage.getByLabel('Colunas').fill('12');
  await gmPage.getByLabel('Linhas').fill('8');
  await gmPage.getByRole('button', { name: 'Criar mapa' }).click();
  const canvas = gmPage.getByTestId('map-canvas');
  await expect(canvas).toBeVisible();

  // Novos pisos
  await gmPage.getByRole('button', { name: 'Assoalho' }).click();
  let at = await mapPoint(canvas);
  await gmPage.mouse.move(at(20, 60).x, at(20, 60).y);
  await gmPage.mouse.down();
  await gmPage.mouse.move(at(220, 60).x, at(220, 60).y, { steps: 12 });
  await gmPage.mouse.up();
  await expect(gmPage.locator('[data-terrain="wood"]')).toHaveCount(6);

  // Água se mexendo numa faixa embaixo
  await gmPage.getByRole('button', { name: 'Água' }).click();
  at = await mapPoint(canvas);
  await gmPage.mouse.move(at(20, 300).x, at(20, 300).y);
  await gmPage.mouse.down();
  await gmPage.mouse.move(at(460, 300).x, at(460, 300).y, { steps: 30 });
  await gmPage.mouse.up();
  await expect(gmPage.locator('[data-terrain="water"]')).toHaveCount(12);

  await gmPage.getByTestId('tool-props').click();
  const palette = gmPage.getByTestId('prop-palette');
  await expect(palette).toBeVisible();
  const placeAt = async (prop: string, px: number, py: number) => {
    await palette.getByRole('button', { name: prop, exact: true }).click();
    const p = (await mapPoint(canvas))(px, py);
    await gmPage.mouse.click(p.x, p.y);
  };
  await placeAt('Porta', 100, 140);
  await placeAt('Tocha', 260, 140);
  await placeAt('Baú', 340, 220);
  await placeAt('Fogueira', 180, 220);
  await placeAt('Círculo ritual', 380, 60);
  const props = gmPage.getByTestId('map-prop');
  await expect(props).toHaveCount(5);
  await expect(gmPage.locator('[data-icon="door"]')).toHaveAttribute('data-state', 'closed');
  await expect(gmPage.locator('[data-icon="torch"]')).toHaveAttribute('data-state', 'on');
  await expect(gmPage.locator('[data-icon="chest"]')).toHaveAttribute('data-state', 'closed');

  // Token do jogador para depois rolar
  await gmPage.getByTestId('toggle-share').click();
  await expect(gmPage.getByText('Na mesa')).toBeVisible();
  await gmPage.screenshot({ path: 'test-results/screens/map-props-editor.png', fullPage: true });
});

test('jogador abre a porta e o mestre vê na hora; teclado também funciona', async () => {
  await plPage.goto(tableUrl);
  await gmPage.goto(tableUrl);
  await expect(plPage.getByTestId('rt-status')).toHaveAttribute('data-status', 'online');
  await expect(gmPage.getByTestId('rt-status')).toHaveAttribute('data-status', 'online');

  const plDoor = plPage.locator('[data-icon="door"]');
  await expect(plDoor).toHaveAttribute('data-state', 'closed');
  await plDoor.click();
  await expect(plDoor).toHaveAttribute('data-state', 'open');
  await expect(gmPage.locator('[data-icon="door"]')).toHaveAttribute('data-state', 'open');

  // Apagar a tocha pelo teclado (Enter)
  const plTorch = plPage.locator('[data-icon="torch"]');
  await plTorch.focus();
  await plPage.keyboard.press('Enter');
  await expect(plTorch).toHaveAttribute('data-state', 'off');
  await expect(gmPage.locator('[data-icon="torch"]')).toHaveAttribute('data-state', 'off');
  await plPage.screenshot({ path: 'test-results/screens/map-props-player.png', fullPage: true });
});

test('rolagem mostra a bandeja de dados animada para todos', async () => {
  await plPage.getByRole('button', { name: 'd20', exact: true }).click();
  await expect(gmPage.getByTestId('dice-tray')).toBeVisible();
  await expect(gmPage.getByTestId('dice-total')).toHaveText(/^\d+/);
  await expect(plPage.getByTestId('dice-tray')).toBeVisible();
  // Some sozinha depois de alguns segundos
  await expect(gmPage.getByTestId('dice-tray')).toBeHidden({ timeout: 6000 });
});

test('abas laterais navegáveis pelas setas do teclado', async () => {
  const chatTab = plPage.getByRole('tab', { name: 'Crônica' });
  await chatTab.focus();
  await plPage.keyboard.press('ArrowRight');
  await expect(plPage.getByRole('tab', { name: /Combate/ })).toHaveAttribute('aria-selected', 'true');
  await expect(plPage.getByRole('tab', { name: /Combate/ })).toBeFocused();
  await plPage.keyboard.press('End');
  await expect(plPage.getByRole('tab', { name: 'Regras' })).toHaveAttribute('aria-selected', 'true');
});
