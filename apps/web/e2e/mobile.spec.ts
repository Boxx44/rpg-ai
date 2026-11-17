import { expect, test } from '@playwright/test';

/** Verifica o uso em celular: cadastro, painel e criação de campanha. */
test('fluxo básico no celular', async ({ page }) => {
  const email = `mobile${Date.now()}@example.com`;
  await page.goto('/register');
  await page.screenshot({ path: 'test-results/screens/register-mobile.png', fullPage: true });
  await page.getByLabel('Nome de exibição').fill('Mia Móvel');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-forte-321');
  await page.getByLabel('Confirmar senha').fill('senha-forte-321');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole('link', { name: 'Nova campanha' }).click();
  await page.getByLabel('Nome da campanha').fill('Campanha de bolso');
  await page.getByRole('button', { name: 'Criar campanha' }).click();
  await expect(page.getByTestId('campaign-title')).toHaveText('Campanha de bolso');
  await page.screenshot({ path: 'test-results/screens/campaign-mobile.png', fullPage: true });
  // Nada vaza horizontalmente da tela
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
