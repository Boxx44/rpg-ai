import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { makePdf } from '../../api/test/pdf-fixture';

/**
 * Ordem Paranormal: escolher o sistema, enviar o livro, criar a ficha,
 * rolar testes pela regra do livro e consultar regras na mesa.
 * Usa um PDF pequeno gerado no teste (o livro real não vai para o repositório).
 */
const stamp = Date.now();
const gm = { name: 'Mestre Ordem', email: `ordem${stamp}@example.com`, password: 'senha-forte-333' };
const BOOK = join(tmpdir(), `livro-teste-${stamp}.pdf`);
writeFileSync(
  BOOK,
  makePdf([
    'Ordem Paranormal - livro de teste',
    'Testes: role um d20 por ponto de atributo e use o maior resultado.',
    'FURTIVIDADE (AGI)\nVoce sabe ser discreto e sorrateiro. Use para se esconder.',
    'Sanidade e enlouquecer\nQuando a Sanidade chega a 0, o agente fica enlouquecendo.',
  ]),
);

test.describe.configure({ mode: 'serial' });
let page: Page;

test('mestre escolhe Ordem Paranormal e envia o livro', async ({ browser }) => {
  page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto('/register');
  await page.getByLabel('Nome de exibição').fill(gm.name);
  await page.getByLabel('E-mail').fill(gm.email);
  await page.getByLabel('Senha', { exact: true }).fill(gm.password);
  await page.getByLabel('Confirmar senha').fill(gm.password);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByRole('link', { name: 'Nova campanha' }).click();
  await page.getByLabel('Nome da campanha').fill('Operação Cinzas');
  await page.getByRole('button', { name: 'Criar campanha' }).click();
  await expect(page.getByTestId('campaign-title')).toHaveText('Operação Cinzas');
  const campaignPath = new URL(page.url()).pathname;

  await page.getByRole('link', { name: 'Gerenciar' }).click();
  await page.getByRole('button', { name: /Usar Ordem Paranormal RPG/ }).click();
  await expect(page.getByRole('heading', { name: 'Ordem Paranormal RPG' })).toBeVisible();
  await expect(page.getByText('28 perícias')).toBeVisible();

  await page.getByTestId('book-input').setInputFiles(BOOK);
  await expect(page.getByTestId('document-row')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(page.getByText('4 páginas')).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/system-book.png', fullPage: true });

  await page.goto(`${campaignPath}/manage`);
  await expect(page.getByTestId('system-panel')).toContainText('Ordem Paranormal RPG');
  await page.goto(campaignPath);
  await expect(page.getByTestId('campaign-title')).toBeVisible();
  test.info().annotations.push({ type: 'campaign', description: campaignPath });
  (globalThis as { campaignPath?: string }).campaignPath = campaignPath;
});

test('ficha de Ordem Paranormal calcula PV/PE/SAN e rola pela regra', async () => {
  const campaignPath = (globalThis as { campaignPath?: string }).campaignPath!;
  await page.goto(`${campaignPath}/characters`);
  await page.getByRole('button', { name: 'Novo personagem' }).click();
  await expect(page.getByTestId('system-sheet')).toBeVisible();
  await page.getByLabel('Nome', { exact: true }).fill('Arthur Cervero');
  await page.getByLabel('Agilidade').fill('3');
  await page.getByLabel('Vigor').fill('2');
  await page.getByLabel('Classe').selectOption('combatente');
  await page.getByLabel('Origem').selectOption({ label: 'Criminoso' });
  await expect(page.getByLabel('Treino em Furtividade')).toHaveValue('treinado');
  await expect(page.getByTestId('resource-pv')).toContainText('22/22');
  await expect(page.getByTestId('resource-san')).toContainText('12/12');
  await expect(page.getByTestId('derived-defesa')).toContainText('13');
  await page.getByLabel('NEX').selectOption('10');
  await expect(page.getByTestId('resource-pv')).toContainText('/28');
  await page.getByRole('button', { name: 'Salvar ficha' }).click();

  await page.getByTestId('character-card').filter({ hasText: 'Arthur Cervero' }).click();
  await page.getByRole('button', { name: 'Rolar Furtividade' }).click();
  await expect(page.getByText(/Arthur Cervero: Furtividade: \d+/)).toBeVisible();
  await expect(page.getByText('3d20kh1+5')).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/ordem-sheet.png', fullPage: true });
});

test('na mesa: ficha rápida, rolagem na crônica e busca de regras no livro', async () => {
  const campaignPath = (globalThis as { campaignPath?: string }).campaignPath!;
  await page.goto(campaignPath);
  // A rolagem feita na ficha já está na crônica
  await expect(
    page.getByTestId('chat-message').filter({ hasText: 'Arthur Cervero: Furtividade' }),
  ).toHaveCount(1);

  await page.getByRole('tab', { name: 'Ficha' }).click();
  await expect(page.getByTestId('quick-pv')).toContainText('28/28');
  await page.getByRole('button', { name: 'Diminuir PV' }).click();
  await expect(page.getByTestId('quick-pv')).toContainText('27/28');
  await page.getByRole('button', { name: 'Rolar Agilidade' }).click();

  await page.getByRole('tab', { name: 'Regras' }).click();
  await expect(page.getByText('Referência rápida — Ordem Paranormal RPG')).toBeVisible();
  await page.getByTestId('rules-search').fill('furtividade');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('rules-hit').first()).toContainText('PDF p. 3');
  await page.getByTestId('rules-hit').first().click();
  await expect(page.getByTestId('rules-page')).toContainText('sorrateiro');
  await page.screenshot({ path: 'test-results/screens/table-rules.png', fullPage: true });

  await page.getByRole('tab', { name: 'Crônica' }).click();
  await expect(page.getByTestId('chat-message').filter({ hasText: 'Arthur Cervero: Agilidade' })).toHaveCount(
    1,
  );
});
