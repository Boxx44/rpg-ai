import { expect, type Page, test } from '@playwright/test';
import { mapPoint } from './map-helpers';

/**
 * Imagens fáceis: botão "Imagem de fundo" na barra, arrastar do computador para o mapa
 * (fundo) ou para um token, colar com Ctrl+V e retrato que salva na hora.
 */
const stamp = Date.now();
const SQ =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAH0lEQVR4XmPcoqHBQApgIkUxCIxqIAaMhhIxgPahBABPAQEkC+3exgAAAABJRU5ErkJggg==';
const BG =
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAATklEQVR4XmPUiLJhGAjANBCWgsCoxXQDLGg2LYiSI8nuhGWPSFIPB6NxTDcwGtR0A6NBTTcwGtR0A6NBTTfAONrYoxcYTdV0A6NBTTcAAF2jBLkk9ZtkAAAAAElFTkSuQmCC';

test.describe.configure({ mode: 'serial' });
let page: Page;
let base = '';

/** Cria, dentro da página, um "arquivo arrastado" com a imagem. */
async function dataTransfer(p: Page, b64: string, name: string) {
  return p.evaluateHandle(
    ({ b64, name }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type: 'image/png' }));
      return dt;
    },
    { b64, name },
  );
}

test('preparação', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await ctx.newPage();
  await page.goto('/register');
  await page.getByLabel('Nome de exibição').fill('Lia Mestra');
  await page.getByLabel('E-mail').fill(`easy${stamp}@example.com`);
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-555');
  await page.getByLabel('Confirmar senha').fill('senha-forte-555');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByRole('link', { name: 'Nova campanha' }).click();
  await page.getByLabel('Nome da campanha').fill('Galeria Sombria');
  await page.getByRole('button', { name: 'Criar campanha' }).click();
  await expect(page.getByTestId('campaign-title')).toHaveText('Galeria Sombria');
  base = new URL(page.url()).pathname;
});

test('retrato pelo botão de câmera do cartão e pela ficha, salvando na hora', async () => {
  await page.goto(`${base}/characters`);
  await page.getByRole('button', { name: 'Novo personagem' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Vera');
  await page.getByRole('button', { name: 'Salvar ficha' }).click();
  const card = page.getByTestId('character-card').filter({ hasText: 'Vera' });
  await expect(card).toBeVisible();
  // câmera no cartão: sem abrir a ficha
  await page
    .getByLabel('Trocar retrato de Vera')
    .setInputFiles({ name: 'v.png', mimeType: 'image/png', buffer: Buffer.from(SQ, 'base64') });
  await expect(page.getByTestId('toast').filter({ hasText: 'Retrato salvo' })).toBeVisible();
  await expect(card.locator('img')).toBeVisible();

  // na ficha: remover o retrato e sair SEM salvar — continua removido
  await card.click();
  await page.getByTestId('image-picker-portrait').getByRole('button', { name: 'Remover imagem' }).click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Retrato removido' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.reload();
  await expect(page.getByTestId('character-card').filter({ hasText: 'Vera' }).locator('img')).toHaveCount(0);
  // e salvar a ficha depois de mexer no retrato não dá conflito de versão
  await page.getByTestId('character-card').filter({ hasText: 'Vera' }).click();
  await page
    .getByTestId('image-picker-portrait')
    .getByLabel(/Enviar retrato/)
    .setInputFiles({ name: 'v.png', mimeType: 'image/png', buffer: Buffer.from(SQ, 'base64') });
  await expect(page.getByTestId('toast').filter({ hasText: 'Retrato salvo' })).toBeVisible();
  await page.getByLabel('Conceito').fill('Fotógrafa');
  await page.getByRole('button', { name: 'Salvar ficha' }).click();
  await expect(page.getByTestId('character-card').filter({ hasText: 'Fotógrafa' })).toBeVisible();
});

test('fundo pelo botão da barra, por arrastar e por Ctrl+V; imagem arrastada para um token', async () => {
  await page.goto(`${base}/maps`);
  await page.getByLabel('Nome do mapa').fill('Galeria');
  await page.getByRole('button', { name: 'Criar mapa' }).click();
  const canvas = page.getByTestId('map-canvas');
  await expect(canvas).toBeVisible();

  // 1) botão "Imagem de fundo" na barra de ferramentas
  await page
    .getByLabel('Escolher imagem de fundo')
    .setInputFiles({ name: 'bg.png', mimeType: 'image/png', buffer: Buffer.from(BG, 'base64') });
  await expect(page.getByTestId('toast').filter({ hasText: 'Fundo do mapa trocado' })).toBeVisible();
  const bg = page.getByTestId('map-background');
  await expect(bg).toHaveCount(1);
  const first = await bg.getAttribute('href');

  // 2) token e arrastar imagem por cima dele
  await page.getByRole('button', { name: 'Colocar token' }).click();
  await page.getByLabel('Nome do token').fill('Sombra');
  const at = await mapPoint(canvas);
  await page.mouse.click(at(100, 100).x, at(100, 100).y);
  await page.getByRole('button', { name: 'Mover', exact: true }).click();
  const token = page.locator('[data-testid="map-token"][data-label="Sombra"]');
  const tb = (await token.boundingBox())!;
  const on = { clientX: tb.x + tb.width / 2, clientY: tb.y + tb.height - 6 };
  const wrap = canvas.locator('xpath=ancestor::div[2]');
  const dt1 = await dataTransfer(page, SQ, 'sombra.png');
  await wrap.dispatchEvent('dragover', { dataTransfer: dt1, ...on });
  await expect(page.getByTestId('drop-overlay')).toContainText('Sombra');
  await wrap.dispatchEvent('drop', { dataTransfer: dt1, ...on });
  await expect(page.getByTestId('token-image')).toHaveCount(1);
  await expect(page.getByTestId('drop-overlay')).toHaveCount(0);

  // 3) arrastar para um lugar vazio troca o fundo
  const e400 = (await mapPoint(canvas))(400, 400);
  const empty = { clientX: e400.x, clientY: e400.y };
  const dt2 = await dataTransfer(page, BG, 'outro.png');
  await wrap.dispatchEvent('dragover', { dataTransfer: dt2, ...empty });
  await expect(page.getByTestId('drop-overlay')).toContainText('fundo do mapa');
  await wrap.dispatchEvent('drop', { dataTransfer: dt2, ...empty });
  await expect.poll(() => bg.getAttribute('href')).not.toBe(first);
  const second = await bg.getAttribute('href');

  // 4) Ctrl+V com imagem copiada
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'colada.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }));
  }, BG);
  await expect.poll(() => bg.getAttribute('href')).not.toBe(second);
  await page.screenshot({ path: 'test-results/screens/easy-images.png', fullPage: true });
});
