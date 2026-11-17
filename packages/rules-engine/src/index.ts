export * from './dice';
export * from './expr';
export * from './system';
export { ORDEM_PARANORMAL } from './systems/ordem-paranormal';

import type { SystemDefinition } from './system';
import { ORDEM_PARANORMAL } from './systems/ordem-paranormal';

/** Modelos de sistema prontos (revisados manualmente a partir dos livros). */
export const SYSTEM_TEMPLATES: Record<string, SystemDefinition> = { [ORDEM_PARANORMAL.id]: ORDEM_PARANORMAL };
