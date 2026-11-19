import type { Locator } from '@playwright/test';

/**
 * O mapa abre ampliado para caber no espaço. Os testes falam em "pixels do mapa a 100%"
 * (cada casa = 40); esta função converte para a posição real na tela.
 */
export async function mapPoint(canvas: Locator) {
  await canvas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await canvas.boundingBox())!;
  const vb = await canvas.evaluate((el) => (el as SVGSVGElement).viewBox.baseVal.width);
  const s = box.width / vb;
  return (px: number, py: number) => ({ x: box.x + px * s, y: box.y + py * s });
}
