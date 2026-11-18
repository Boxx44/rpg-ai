import { expect, type Page, test } from '@playwright/test';

/**
 * Mesa de treino (pronta para testar tudo), "ver como jogador", interlúdio,
 * NPC com ficha no combate e biblioteca de fichas com criação guiada.
 */
const stamp = Date.now();
const user = { name: 'Mestre Treino', email: `treino${stamp}@example.com`, password: 'senha-forte-777' };

test.describe.configure({ mode: 'serial' });
let page: Page;
let tablePath = '';

test('cria a mesa de treino pronta a partir do painel', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await ctx.newPage();
  await page.goto('/register');
  await page.getByLabel('Nome de exibição').fill(user.name);
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill(user.password);
  await page.getByLabel('Confirmar senha').fill(user.password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByTestId('practice-card').click();
  await page.getByTestId('practice-open').click();
  await expect(page.getByTestId('campaign-title')).toHaveText('Mesa de treino');
  tablePath = new URL(page.url()).pathname;
  await expect(
    page.getByTestId('chat-message').filter({ hasText: 'Bem-vindo à mesa de treino' }),
  ).toHaveCount(1);
  await expect(page.getByTestId('preview-bar')).toBeVisible();
});

test('combate com NPC de ficha completa e criatura oculta; ver como jogador esconde segredos', async () => {
  await page.getByRole('tab', { name: /Combate/ }).click();
  await page.getByRole('button', { name: 'Iniciar combate' }).click();
  await page.getByLabel('Tipo de combatente').selectOption('npc');
  await page.getByLabel('NPC', { exact: true }).selectOption({ label: 'Cultista Mascarado' });
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByTestId('npc-actions')).toBeVisible();
  await page.getByRole('button', { name: 'Cultista Mascarado ataca com Punhal' }).click();
  await page.getByLabel('Tipo de combatente').selectOption('creature');
  await page.getByLabel('Criatura').selectOption('policial');
  await page.getByLabel('Oculto dos jogadores').check();
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.locator('[data-testid="combatant"][data-name="Policial"]')).toBeVisible();

  await page.getByRole('button', { name: 'Ver como jogador' }).click();
  await expect(page.getByTestId('preview-bar')).toContainText('Pré-visualização');
  await expect(page.locator('[data-testid="combatant"][data-name="Policial"]')).toHaveCount(0);
  await expect(page.getByTestId('npc-actions')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/screens/preview-as-player.png', fullPage: true });
  await page.getByRole('button', { name: 'Voltar a ver como mestre' }).click();
  await expect(page.locator('[data-testid="combatant"][data-name="Policial"]')).toBeVisible();

  await page.getByRole('tab', { name: 'Crônica' }).click();
  await expect(
    page.getByTestId('chat-message').filter({ hasText: 'Cultista Mascarado: Punhal: ataque' }),
  ).toHaveCount(1);
});

test('interlúdio recupera pela regra e aparece na crônica', async () => {
  await page.getByRole('tab', { name: 'Ficha' }).click();
  await page.getByRole('button', { name: /Interlúdio/ }).click();
  await page.getByLabel('Condição de descanso').selectOption('confortavel');
  await page.getByRole('button', { name: 'Descansar' }).click();
  await page.getByRole('tab', { name: 'Crônica' }).click();
  await expect(page.getByTestId('chat-message').filter({ hasText: 'descansa no interlúdio' })).toHaveCount(1);
});

test('biblioteca: criação guiada passo a passo e levar para a campanha', async () => {
  await page.getByRole('link', { name: 'Fichas', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Fichas' })).toBeVisible();
  await page.getByRole('button', { name: 'Criação guiada' }).click();
  const g = page.getByTestId('guided-creator');
  // O ajudante explica cada passo e o que estiver em foco.
  await expect(page.getByTestId('helper')).toContainText('Quem é o seu personagem?');
  await g.getByLabel('Nome do personagem').fill('Bia Torres');
  await g.getByLabel('Conceito').fill('Hacker que viu demais');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.getByTestId('helper')).toContainText('Atributos');
  await page.getByTestId('g-attr-AGI').hover();
  await expect(page.getByTestId('helper-focus')).toContainText('Defesa');
  for (const a of ['Agilidade', 'Agilidade', 'Intelecto', 'Presença'])
    await page.getByRole('button', { name: `Aumentar ${a}` }).click();
  await expect(page.getByTestId('g-points-left')).toHaveText('Pontos distribuídos.');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.getByTestId('origin-power')).toContainText('Poder:');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await page.getByRole('button', { name: /^Especialista/ }).click();
  await expect(page.getByRole('button', { name: /^Especialista/ })).toContainText('faz-tudo');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.getByTestId('g-free-count')).toHaveText('0/9');
  for (let i = 0; i < 9; i++)
    await g.locator('input[type="checkbox"]:not(:checked):not(:disabled)').first().check();
  await expect(page.getByTestId('g-free-count')).toHaveText('9/9');
  await page.getByRole('button', { name: 'Próximo' }).click();
  await g.locator('label', { hasText: 'Pistola' }).locator('input').check();
  await page.getByRole('button', { name: 'Próximo' }).click();
  await expect(page.getByTestId('g-review')).toContainText('Bia Torres');
  await expect(page.getByTestId('g-review')).toContainText('Pistola');
  await page.getByRole('button', { name: 'Criar ficha' }).click();
  await expect(page.getByTestId('weapon-row')).toContainText('Pistola');
  // Na ficha completa, o "?" explica cada número.
  await page.getByTestId('derived-defesa').getByTitle('O que é Defesa?').click();
  await expect(page.getByTestId('help-bubble')).toContainText('10 + Agilidade');
  await page.screenshot({ path: 'test-results/screens/help-bubble.png' });
  await page.getByRole('button', { name: 'Salvar ficha' }).click();
  const card = page.getByTestId('library-card').filter({ hasText: 'Bia Torres' });
  await expect(card).toBeVisible();
  await card
    .getByLabel('Campanha para Bia Torres')
    .selectOption({ label: 'Mesa de treino (Ordem Paranormal RPG)' });
  await card.getByRole('button', { name: 'Levar Bia Torres' }).click();
  await expect(card).toContainText('Uma cópia entrou na campanha');
  await page.screenshot({ path: 'test-results/screens/library.png', fullPage: true });
  await page.goto(`${tablePath}/characters`);
  await expect(page.getByTestId('character-card').filter({ hasText: 'Bia Torres' })).toBeVisible();
});
