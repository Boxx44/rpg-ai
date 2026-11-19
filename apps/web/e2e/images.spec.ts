import { type Browser, expect, type Page, test } from '@playwright/test';
import { mapPoint } from './map-helpers';

/**
 * Imagens e combate: modelo de mapa pronto, fundo por imagem (com ajuste da grade),
 * imagem de token, retrato do personagem e a entrada em combate (faixa + barra de iniciativa).
 */
const stamp = Date.now();
const gm = { name: 'Íris Mestra', email: `igm${stamp}@example.com`, password: 'senha-forte-777' };
const pl = { name: 'Davi Jogador', email: `ipl${stamp}@example.com`, password: 'senha-forte-888' };

// Imagem 40×30 (proporção 4:3) e quadrada 16×16, geradas para o teste.
const BG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAATklEQVR4XmPUiLJhGAjANBCWgsCoxXQDLGg2LYiSI8nuhGWPSFIPB6NxTDcwGtR0A6NBTTcwGtR0A6NBTTfAONrYoxcYTdV0A6NBTTcAAF2jBLkk9ZtkAAAAAElFTkSuQmCC',
  'base64',
);
const SQ = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAH0lEQVR4XmPcoqHBQApgIkUxCIxqIAaMhhIxgPahBABPAQEkC+3exgAAAABJRU5ErkJggg==',
  'base64',
);
const png = (name: string, buffer: Buffer) => ({ name, mimeType: 'image/png', buffer });

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

test('preparação: campanha, jogador e personagem com retrato', async ({ browser }) => {
  gmPage = await newUser(browser, gm);
  await gmPage.getByRole('link', { name: 'Nova campanha' }).click();
  await gmPage.getByLabel('Nome da campanha').fill('Retratos do Medo');
  await gmPage.getByRole('button', { name: 'Criar campanha' }).click();
  await expect(gmPage.getByTestId('campaign-title')).toHaveText('Retratos do Medo');
  base = new URL(gmPage.url()).pathname;
  await gmPage.goto(`${base}/manage`);
  await gmPage.getByRole('button', { name: 'Gerar link' }).click();
  const link = await gmPage.getByTestId('invite-link').inputValue();
  plPage = await newUser(browser, pl, new URL(link).pathname);
  await plPage.getByRole('button', { name: 'Aceitar convite' }).click();
  await expect(plPage.getByTestId('campaign-title')).toHaveText('Retratos do Medo');

  await plPage.goto(`${base}/characters`);
  await plPage.getByRole('button', { name: 'Novo personagem' }).click();
  await plPage.getByLabel('Nome', { exact: true }).fill('Davi');
  await plPage.getByRole('button', { name: 'Salvar ficha' }).click();
  await plPage.getByTestId('character-card').filter({ hasText: 'Davi' }).click();
  const picker = plPage.getByTestId('image-picker-portrait');
  await picker
    .getByLabel('Enviar retrato (aparece no token e no combate)')
    .setInputFiles(png('davi.png', SQ));
  await expect(picker.getByTestId('image-preview')).toBeVisible();
  await plPage.getByRole('button', { name: 'Salvar ficha' }).click();
  await expect(plPage.getByTestId('character-card').filter({ hasText: 'Davi' }).locator('img')).toBeVisible();
});

test('mestre cria mapa pelo modelo "Casa abandonada"', async () => {
  await gmPage.goto(`${base}/maps`);
  await gmPage.getByLabel('Nome do mapa').fill('Casa da Rua 9');
  await gmPage.getByRole('radio', { name: /Casa abandonada/ }).click();
  await gmPage.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(gmPage.getByTestId('map-canvas')).toBeVisible();
  expect(await gmPage.getByTestId('map-prop').count()).toBeGreaterThan(10);
  await expect(gmPage.locator('[data-icon="ritual"]')).toHaveCount(1);
  expect(await gmPage.locator('[data-terrain="wood"]').count()).toBeGreaterThan(50);
  await gmPage.screenshot({ path: 'test-results/screens/template-house.png', fullPage: true });
});

test('fundo por imagem, ajuste da grade e imagem de token', async () => {
  await gmPage.getByLabel('Nome do mapa').fill('Planta baixa');
  await gmPage.getByRole('radio', { name: /Em branco/ }).click();
  await gmPage.getByRole('button', { name: 'Criar mapa' }).click();
  await expect(gmPage.locator('h2', { hasText: 'Planta baixa' })).toBeVisible();
  const panel = gmPage.getByTestId('background-panel');
  await panel.getByLabel('Enviar fundo do mapa').setInputFiles(png('planta.png', BG));
  await expect(gmPage.getByTestId('map-background')).toHaveCount(1);
  // 24 colunas numa imagem 4:3 → 18 linhas
  await panel.getByTestId('fit-grid').click();
  await expect(gmPage.locator('aside').getByLabel('Linhas')).toHaveValue('18');
  await panel.getByLabel('Mostrar grade').uncheck();
  await expect(panel.getByLabel('Mostrar grade')).not.toBeChecked();

  // Token de inimigo com imagem própria
  await gmPage.getByRole('button', { name: 'Colocar token' }).click();
  await gmPage.getByLabel('Nome do token').fill('Sombra');
  const canvas = gmPage.getByTestId('map-canvas');
  const p = (await mapPoint(canvas))(100, 100);
  await gmPage.mouse.click(p.x, p.y);
  await gmPage.getByRole('button', { name: 'Mover', exact: true }).click();
  await gmPage.locator('[data-testid="map-token"][data-label="Sombra"]').click();
  await gmPage
    .getByTestId('image-picker-token')
    .getByLabel(/Enviar imagem do token/)
    .setInputFiles(png('sombra.png', SQ));
  await expect(gmPage.getByTestId('token-image')).toHaveCount(1);

  // Reaproveitar uma imagem já enviada
  await gmPage.getByTestId('image-picker-token').getByRole('button', { name: 'Já enviadas' }).click();
  await expect(gmPage.getByTestId('image-gallery').locator('img')).toHaveCount(1);
  await gmPage.getByTestId('toggle-share').click();
  await expect(gmPage.getByText('Na mesa')).toBeVisible();
  await gmPage.screenshot({ path: 'test-results/screens/map-background.png', fullPage: true });
});

test('jogador vê fundo e imagem; combate abre com faixa e barra de iniciativa', async () => {
  await plPage.goto(base);
  await gmPage.goto(base);
  await expect(plPage.getByTestId('rt-status')).toHaveAttribute('data-status', 'online');
  await expect(plPage.getByTestId('map-background')).toHaveCount(1);
  await expect(plPage.getByTestId('token-image')).toHaveCount(1);

  await gmPage.getByRole('tab', { name: /Combate/ }).click();
  await gmPage.getByRole('button', { name: 'Iniciar combate' }).click();

  // Do lado do jogador: faixa "Combate!", aba Combate aberta sozinha e barra com o retrato
  const intro = plPage.getByTestId('combat-intro');
  await expect(intro).toBeVisible();
  await expect(intro).toContainText('Davi');
  await expect(plPage.getByRole('tab', { name: /Combate/ })).toHaveAttribute('aria-selected', 'true');
  await plPage.screenshot({ path: 'test-results/screens/combat-intro.png' });
  await expect(intro).toBeHidden({ timeout: 8000 });
  const bar = plPage.getByTestId('initiative-bar');
  await expect(bar).toBeVisible();
  await expect(bar.getByTestId('initiative-item').filter({ hasText: 'Davi' }).locator('img')).toBeVisible();

  // Inimigo entra depois: o jogador recebe o aviso
  await gmPage.getByLabel('Nome do inimigo').fill('Sombra');
  await gmPage.getByLabel('Quantos inimigos').fill('1');
  await gmPage.getByRole('button', { name: 'Adicionar' }).click();
  await expect(plPage.getByTestId('toast').filter({ hasText: 'Sombra entrou no combate' })).toBeVisible();
  // o inimigo usa a imagem do token de mesmo nome
  await expect(bar.getByTestId('initiative-item').filter({ hasText: 'Sombra' }).locator('img')).toBeVisible();
  await plPage.screenshot({ path: 'test-results/screens/initiative-bar.png', fullPage: true });

  await gmPage.getByRole('button', { name: 'Encerrar combate' }).click();
  await gmPage.getByRole('button', { name: 'Confirmar fim' }).click();
  await expect(plPage.getByTestId('toast').filter({ hasText: 'Combate encerrado' })).toBeVisible();
  await expect(bar).toBeHidden();
});
