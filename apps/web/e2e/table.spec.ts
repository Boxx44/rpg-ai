import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';

/**
 * Mesa de jogo com dois navegadores ao mesmo tempo (mestre e jogador):
 * personagem, NPC com segredo, criação de mapa, tokens, rolagens e chat em tempo real.
 */
const stamp = Date.now();
const gm = { name: 'Gaia Mestra', email: `gm${stamp}@example.com`, password: 'senha-forte-111' };
const pl = { name: 'Pedro Jogador', email: `pl${stamp}@example.com`, password: 'senha-forte-222' };

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

async function dragBy(page: Page, el: Locator, dxCells: number, dyCells: number, cellPx = 40) {
  const box = (await el.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++)
    await page.mouse.move(x + (dxCells * cellPx * i) / 5, y + (dyCells * cellPx * i) / 5);
  await page.mouse.up();
}

test('mestre cria a campanha e convida; jogador entra na mesa', async ({ browser }) => {
  gmPage = await newUser(browser, gm);
  await expect(gmPage).toHaveURL(/\/dashboard/);
  await gmPage.getByRole('link', { name: 'Nova campanha' }).click();
  await gmPage.getByLabel('Nome da campanha').fill('A Cripta Esquecida');
  await gmPage.getByRole('button', { name: 'Criar campanha' }).click();
  await expect(gmPage.getByTestId('campaign-title')).toHaveText('A Cripta Esquecida');
  tableUrl = new URL(gmPage.url()).pathname;
  await gmPage.getByRole('link', { name: 'Gerenciar' }).click();
  await gmPage.getByRole('button', { name: 'Gerar link' }).click();
  const link = await gmPage.getByTestId('invite-link').inputValue();

  plPage = await newUser(browser, pl, new URL(link).pathname);
  await plPage.getByRole('button', { name: 'Aceitar convite' }).click();
  await expect(plPage.getByTestId('campaign-title')).toHaveText('A Cripta Esquecida');
  await expect(plPage.getByText('O mestre ainda não compartilhou um mapa.')).toBeVisible();
});

test('jogador cria a ficha do personagem', async () => {
  await plPage.getByRole('link', { name: 'Personagens' }).click();
  await plPage.getByRole('button', { name: 'Novo personagem' }).click();
  await plPage.getByLabel('Nome', { exact: true }).fill('Lyra');
  await plPage.getByLabel('Conceito').fill('Ladina élfica');
  await plPage.getByLabel('Valor de Força').fill('10');
  await plPage.getByLabel('Valor de Destreza').fill('17');
  await plPage.getByRole('button', { name: 'Item' }).click();
  await plPage.getByLabel('Item', { exact: true }).fill('Adaga');
  await plPage.getByLabel('Aumentar Vida').click();
  await plPage.screenshot({ path: 'test-results/screens/character-sheet.png', fullPage: true });
  await plPage.getByRole('button', { name: 'Salvar ficha' }).click();
  await expect(plPage.getByTestId('character-card')).toContainText('Lyra');
  await expect(plPage.getByTestId('character-card')).toContainText('11/10');
});

test('mestre cria um NPC com segredo (oculto do jogador)', async () => {
  await gmPage.goto(`${tableUrl}/npcs`);
  await gmPage.getByRole('button', { name: 'Novo NPC' }).click();
  await gmPage.getByLabel('Nome', { exact: true }).fill('Irmão Odo');
  await gmPage.getByLabel('Aparência', { exact: true }).fill('Monge de manto cinza, olhos fundos.');
  await gmPage.getByLabel('Segredos').fill('É o necromante da cripta');
  await gmPage.screenshot({ path: 'test-results/screens/npc-editor.png', fullPage: true });
  await gmPage.getByRole('button', { name: 'Salvar NPC' }).click();
  await expect(gmPage.getByTestId('npc-card')).toContainText('Irmão Odo');

  await plPage.goto(`${tableUrl}/npcs`);
  await expect(plPage.getByText('Ninguém foi apresentado ainda.')).toBeVisible();
  await expect(plPage.getByText('necromante')).toHaveCount(0);
});

test('mestre cria e pinta um mapa, coloca tokens e compartilha', async () => {
  await gmPage.goto(`${tableUrl}/maps`);
  await gmPage.getByLabel('Nome do mapa').fill('Cripta');
  await gmPage.getByLabel('Colunas').fill('16');
  await gmPage.getByLabel('Linhas').fill('10');
  await gmPage.getByRole('button', { name: 'Criar mapa' }).click();
  const canvas = gmPage.getByTestId('map-canvas');
  await expect(canvas).toBeVisible();

  // Pinta uma parede arrastando
  await gmPage.getByRole('button', { name: 'Parede' }).click();
  const box = (await canvas.boundingBox())!;
  await gmPage.mouse.move(box.x + 20, box.y + 20);
  await gmPage.mouse.down();
  await gmPage.mouse.move(box.x + 300, box.y + 20, { steps: 10 });
  await gmPage.mouse.up();
  await expect(gmPage.locator('[data-terrain="wall"]')).toHaveCount(8);

  // Token do personagem do jogador
  await gmPage.getByRole('button', { name: 'Colocar token' }).click();
  await gmPage.getByLabel('Vincular a').selectOption({ label: `Lyra (${pl.name})` });
  await gmPage.mouse.click(box.x + 60, box.y + 100);
  await expect(gmPage.getByTestId('map-token').filter({ hasText: 'L' })).toHaveCount(1);

  // Inimigo oculto
  await gmPage.getByLabel('Vincular a').selectOption('');
  await gmPage.getByLabel('Nome do token').fill('Esqueleto');
  await gmPage.getByLabel('Oculto').check();
  const box2 = (await canvas.boundingBox())!; // o painel lateral pode ter rolado a página
  await gmPage.mouse.click(box2.x + 420, box2.y + 260);
  await expect(gmPage.getByTestId('map-token')).toHaveCount(2);

  await gmPage.getByTestId('toggle-share').click();
  await expect(gmPage.getByText('Na mesa')).toBeVisible();
  await gmPage.screenshot({ path: 'test-results/screens/map-editor.png', fullPage: true });
});

test('jogador vê o mapa ao vivo, sem o inimigo oculto, e move o próprio token', async () => {
  await plPage.goto(tableUrl);
  await expect(plPage.getByTestId('rt-status')).toHaveAttribute('data-status', 'online');
  await gmPage.goto(tableUrl);
  await expect(gmPage.getByTestId('rt-status')).toHaveAttribute('data-status', 'online');

  const plTokens = plPage.getByTestId('map-token');
  await expect(plTokens).toHaveCount(1);
  await expect(plTokens.first()).toHaveAttribute('data-label', 'Lyra');
  await expect(gmPage.getByTestId('map-token')).toHaveCount(2);

  await dragBy(plPage, plTokens.first(), 3, 1);
  await expect(plTokens.first()).toHaveAttribute('data-x', '4');
  // O mestre recebe o movimento em tempo real
  await expect(gmPage.locator('[data-label="Lyra"]')).toHaveAttribute('data-x', '4');
  await expect(gmPage.locator('[data-label="Lyra"]')).toHaveAttribute('data-y', '3');
});

test('rolagens e chat em tempo real, com segredo do mestre', async () => {
  await plPage.getByRole('button', { name: 'd20', exact: true }).click();
  await expect(gmPage.getByTestId('chat-message').filter({ hasText: pl.name })).toHaveCount(1);
  await expect(gmPage.getByTestId('roll-total').first()).toBeVisible();

  await plPage.getByTestId('chat-input').fill('2d6+3');
  await plPage.getByLabel('Rótulo da rolagem').fill('Dano da adaga');
  await plPage.keyboard.press('Enter');
  await expect(gmPage.getByText('Dano da adaga')).toBeVisible();

  // Rolagem secreta do mestre
  await gmPage.getByLabel('Quem vê').selectOption('gm');
  await gmPage.getByLabel('Rótulo da rolagem').fill('Emboscada');
  await gmPage.getByTestId('chat-input').fill('1d20+4');
  await gmPage.getByRole('button', { name: 'Rolar' }).click();
  await expect(gmPage.getByText('Emboscada')).toBeVisible();

  // Mestre fala como NPC
  await gmPage.getByLabel('Quem vê').selectOption('public');
  await gmPage.getByLabel('Falar como').selectOption({ label: 'Irmão Odo' });
  await gmPage.getByTestId('chat-input').fill('Vocês não deveriam estar aqui...');
  await gmPage.keyboard.press('Enter');

  await expect(plPage.getByText('Vocês não deveriam estar aqui...')).toBeVisible();
  await expect(plPage.getByTestId('chat-message').filter({ hasText: 'Irmão Odo' })).toHaveCount(1);
  await expect(plPage.getByText('Emboscada')).toHaveCount(0);
  await plPage.screenshot({ path: 'test-results/screens/table-player.png', fullPage: true });
  await gmPage.screenshot({ path: 'test-results/screens/table-gm.png', fullPage: true });
});

test('ao recarregar, o histórico continua lá', async () => {
  await plPage.reload();
  await expect(plPage.getByText('Dano da adaga')).toBeVisible();
  await expect(plPage.getByText('Emboscada')).toHaveCount(0);
  await expect(plPage.getByTestId('map-token')).toHaveCount(1);
});
