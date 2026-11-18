import { Inject, Injectable } from '@nestjs/common';
import {
  buildAttack,
  computeSheet,
  FormulaError,
  keptD20,
  planRest,
  planRitual,
  type RitualForm,
  sanitizeValues,
  type SystemDefinition,
  type SystemValues,
  validateSystem,
} from '@rpg-ai/rules-engine';
import { type Database, type Tx, withUser } from '@rpg-ai/db';
import type { CharacterSheet } from '@rpg-ai/shared';
import { type ActionResultDto, attackSchema, castSchema, ERROR_CODES, restSchema } from '@rpg-ai/shared';
import type { z } from 'zod';
import { AppError } from '../common/errors';
import { DB } from '../common/tokens';
import { ChatService } from './chat';
import type { SystemsService } from './documents/systems';

/** Quem age: personagem ou NPC, já com a ficha validada contra o sistema da campanha. */
export interface Actor {
  name: string;
  def: SystemDefinition;
  values: SystemValues;
  /** Grava recursos atuais e perdas permanentes (somadas às existentes). */
  save(tx: Tx, current: Record<string, number>, permAdd?: Record<string, number>): Promise<void>;
}
export type ActorLoader = (tx: Tx) => Promise<Actor>;

export function rulesError<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof FormulaError) throw new AppError(ERROR_CODES.VALIDATION, e.message, 400);
    throw e;
  }
}

/** Valida a parte de sistema de uma ficha contra o sistema da campanha (sem sistema: descarta). */
export async function sheetForCampaign(systems: SystemsService, tx: Tx, cid: string, sheet: CharacterSheet) {
  const sys = await systems.campaignSystemTx(tx, cid);
  if (!sys) {
    const { system: _drop, ...rest } = sheet;
    return rest as CharacterSheet;
  }
  if (!sheet.system) return sheet;
  const def = validateSystem(sys.definition);
  return { ...sheet, system: rulesError(() => sanitizeValues(def, sheet.system)) } as CharacterSheet;
}

export function resourceNow(def: SystemDefinition, values: SystemValues, key: string): number {
  return computeSheet(def, values).resources.find((r) => r.key === key)?.current ?? 0;
}

/** Monta o novo `system` da ficha com recursos e perdas permanentes atualizados. */
export function withCurrent(
  system: Record<string, unknown>,
  values: SystemValues,
  current: Record<string, number>,
  permAdd: Record<string, number> = {},
) {
  const perm = { ...values.perm };
  for (const [k, n] of Object.entries(permAdd)) perm[k] = Math.min(999, (perm[k] ?? 0) + n);
  return { ...system, current: { ...values.current, ...current }, perm };
}

/**
 * Ações de ficha comuns a personagens e NPCs: atacar, conjurar e descansar.
 * As regras vêm do motor (pacote rules-engine); aqui só rolamos no servidor,
 * gravamos na crônica e descontamos recursos.
 */
@Injectable()
export class SheetActions {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly chat: ChatService,
  ) {}

  async attack(
    userId: string,
    cid: string,
    load: ActorLoader,
    input: z.infer<typeof attackSchema>,
  ): Promise<ActionResultDto> {
    const { plan, name } = await withUser(this.db, userId, async (tx) => {
      const a = await load(tx);
      return { name: a.name, plan: rulesError(() => buildAttack(a.def, a.values, input.weapon, input)) };
    });
    const atk = await this.chat.roll(userId, cid, {
      expression: plan.attack.expression,
      label: `${name}: ${plan.attack.label}`.slice(0, 80),
      visibility: input.visibility,
    });
    const natural = atk.roll
      ? keptD20({ expression: atk.roll.expression, total: atk.roll.total, parts: atk.roll.parts as never })
      : null;
    const critical = natural !== null && natural >= plan.critRange;
    const dmg = await this.chat.roll(userId, cid, {
      expression: critical ? plan.damage.critExpression : plan.damage.expression,
      label:
        `${name}: dano${critical ? ` CRÍTICO x${plan.critMult}` : ''}${plan.damage.type ? ` (${plan.damage.type})` : ''}`.slice(
          0,
          80,
        ),
      visibility: input.visibility,
    });
    return {
      messages: [atk, dmg],
      critical,
      notes: [...plan.notes, 'Acerta se o teste for maior ou igual à Defesa do alvo.'],
    };
  }

  async cast(
    userId: string,
    cid: string,
    load: ActorLoader,
    input: z.infer<typeof castSchema>,
  ): Promise<ActionResultDto> {
    const prep = await withUser(this.db, userId, async (tx) => {
      const a = await load(tx);
      const plan = rulesError(() => planRitual(a.def, a.values, input.ritual, input.form as RitualForm));
      const san = a.def.ritualRules?.sanity;
      const current: Record<string, number> = { [plan.spend.key]: plan.spend.after };
      if (plan.sanityLoss && san) current[san] = resourceNow(a.def, a.values, san) - plan.sanityLoss;
      await a.save(tx, current, plan.permanentLoss && san ? { [san]: plan.permanentLoss } : {});
      return { plan, name: a.name, san };
    });
    const { plan, name, san } = prep;
    const formName =
      input.form === 'basic' ? '' : ` (${input.form === 'discente' ? 'discente' : 'verdadeiro'})`;
    const messages = [
      await this.chat.post(userId, cid, {
        content: `✶ ${name} conjura ${plan.name}${formName}: −${plan.cost} PE · DT ${plan.dt}${plan.sanityLoss ? ` · −${plan.sanityLoss} SAN` : ''}`,
        visibility: input.visibility,
      }),
    ];
    const notes = [...plan.notes];
    if (plan.permanentNote) notes.push(plan.permanentNote);
    if (plan.sanityCheck) {
      const chk = await this.chat.roll(userId, cid, {
        expression: plan.sanityCheck.expression,
        label: `${name}: custo paranormal (DT ${plan.sanityCheck.dc})`.slice(0, 80),
        visibility: input.visibility,
      });
      messages.push(chk);
      const total = chk.roll?.total ?? 0;
      if (total < plan.sanityCheck.dc && san) {
        const permanent = plan.sanityCheck.dc - total >= 5;
        await withUser(this.db, userId, async (tx) => {
          const a = await load(tx);
          await a.save(
            tx,
            { [san]: resourceNow(a.def, a.values, san) - plan.sanityCheck!.loss },
            permanent ? { [san]: 1 } : {},
          );
        });
        notes.push(`Falhou no custo paranormal: perdeu ${plan.sanityCheck.loss} de Sanidade.`);
        if (permanent)
          notes.push('Falhou por 5 ou mais: perdeu também 1 de Sanidade máxima, para sempre (p. 131).');
      }
    }
    if (plan.effect)
      messages.push(
        await this.chat.roll(userId, cid, {
          expression: plan.effect.expression,
          label: plan.effect.label.slice(0, 80),
          visibility: input.visibility,
        }),
      );
    return { messages, notes };
  }

  async rest(
    userId: string,
    cid: string,
    load: ActorLoader,
    input: z.infer<typeof restSchema>,
  ): Promise<ActionResultDto> {
    const { plan, name } = await withUser(this.db, userId, async (tx) => {
      const a = await load(tx);
      const plan = rulesError(() => planRest(a.def, a.values, input));
      await a.save(tx, plan.changes);
      return { plan, name: a.name };
    });
    const gained = plan.gains.map((g) => `+${g.amount} ${g.label}`).join(', ');
    const msg = await this.chat.post(userId, cid, {
      content: `☾ ${name} descansa no interlúdio${input.sleep ? ' (dorme' : ' ('}${input.sleep && input.relax ? ' e relaxa)' : input.relax ? 'relaxa)' : ')'}: ${gained || 'nada a recuperar'}.`,
      visibility: 'public',
    });
    return { messages: [msg], notes: plan.notes };
  }
}
