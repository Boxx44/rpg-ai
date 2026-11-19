import { expect, type Page, test } from '@playwright/test';

/**
 * Mesa no celular: barra fixa embaixo (um painel por vez), mapa que cabe na tela,
 * combate e nenhuma tela com rolagem para o lado.
 */
async function noSideScroll(page: Page, where: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, `rolagem lateral em ${where}`).toBeLessThanOrEqual(1);
}

test('mesa de treino utilizável no celular', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/register');
  await page.getByLabel('Nome de exibição').fill('Ana Celular');
  await page.getByLabel('E-mail').fill(`cel${Date.now()}@example.com`);
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-321');
  await page.getByLabel('Confirmar senha').fill('senha-forte-321');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto('/practice');
  await page.getByTestId('practice-open').click();
  await expect(page.getByTestId('campaign-title')).toBeVisible({ timeout: 30_000 });
  const base = new URL(page.url()).pathname;

  // Barra de baixo; começa no mapa, e o mapa já cabe na largura da tela
  const nav = page.getByTestId('table-bottom-nav');
  await expect(nav).toBeVisible();
  const canvas = page.getByTestId('map-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Painel lateral' })).toBeHidden();
  const vw = page.viewportSize()!.width;
  await expect.poll(async () => (await canvas.boundingBox())!.width).toBeLessThanOrEqual(vw);
  await noSideScroll(page, 'mesa');
  await page.screenshot({ path: 'test-results/screens/mobile-table-map.png' });

  // Crônica ocupa a tela; o mapa some
  await nav.getByRole('button', { name: 'Crônica' }).click();
  await expect(page.getByTestId('chat-list')).toBeVisible();
  await expect(canvas).toBeHidden();
  await page.getByRole('button', { name: 'd20', exact: true }).click();
  await expect(page.getByTestId('dice-tray')).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/mobile-table-chat.png' });

  // Combate pela barra de baixo; ao voltar ao mapa a barra de iniciativa aparece
  await nav.getByRole('button', { name: 'Combate' }).click();
  await page.getByRole('button', { name: 'Iniciar combate' }).click();
  await expect(page.getByTestId('combat-intro')).toBeVisible();
  await expect(page.getByTestId('combat-intro')).toBeHidden({ timeout: 8000 });
  await nav.getByRole('button', { name: 'Mapa' }).click();
  await expect(page.getByTestId('initiative-bar')).toBeVisible();
  await noSideScroll(page, 'mesa em combate');
  await page.screenshot({ path: 'test-results/screens/mobile-table-combat.png' });

  // Ficha e regras
  await nav.getByRole('button', { name: 'Ficha' }).click();
  await expect(canvas).toBeHidden();
  await noSideScroll(page, 'ficha');
  await nav.getByRole('button', { name: 'Regras' }).click();
  await noSideScroll(page, 'regras');

  // Editor de mapas: formulário de novo mapa recolhido, mapa logo no topo
  await page.goto(`${base}/maps`);
  await expect(page.getByTestId('toggle-new-map')).toBeVisible();
  await expect(page.getByLabel('Nome do mapa')).toBeHidden();
  await page.getByTestId('toggle-new-map').click();
  await expect(page.getByLabel('Nome do mapa')).toBeVisible();
  await page.getByTestId('toggle-new-map').click();
  await page.getByTestId('map-fit').click();
  await expect
    .poll(async () => (await page.getByTestId('map-canvas').boundingBox())!.width)
    .toBeLessThanOrEqual(vw);
  await noSideScroll(page, 'mapas');

  // Demais telas sem rolagem lateral
  for (const p of ['/characters', '/npcs', '/sessions', '/manage']) {
    await page.goto(base + p);
    await page.waitForLoadState('networkidle');
    await noSideScroll(page, p);
  }
  for (const p of ['/dashboard', '/library', '/practice', '/profile']) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    await noSideScroll(page, p);
  }
  // Ficha aberta: botão de salvar sempre à mão (preso embaixo)
  await page.goto(base + '/characters');
  await page.getByTestId('character-card').first().click();
  const save = page.getByRole('button', { name: 'Salvar ficha' });
  await expect(save).toBeInViewport();
});
