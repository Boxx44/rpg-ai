import { Controller, Delete, HttpCode, Inject, Injectable, Post } from '@nestjs/common';
import { and, type Database, eq, isNull, schema, sql, withUser } from '@rpg-ai/db';
import type { CharacterSheet } from '@rpg-ai/shared';
import { Ctx, CurrentUser, type RequestCtx } from '../common/http';
import { type AuthUser, DB } from '../common/tokens';
import { CampaignsService } from './campaigns.service';
import { CharactersService } from './characters';
import { ChatService } from './chat';
import { SystemsService } from './documents/systems';
import { MapsService } from './maps';
import { NpcsService } from './npcs';

const c = schema.campaigns;

/** Fichas de exemplo (Ordem Paranormal), feitas para mostrar armas, rituais e trilhas. */
const AGENT_COMBAT: CharacterSheet = {
  attributes: [],
  resources: [],
  inventory: [],
  notes: 'Personagem de exemplo da mesa de treino. Pode mudar à vontade.',
  system: {
    attributes: { AGI: 2, FOR: 3, INT: 1, PRE: 1, VIG: 2 },
    fields: { classe: 'combatente', nex: '10', origem: 'militar', trilha: 'guerreiro' },
    skills: { luta: 'treinado', pontaria: 'treinado', fortitude: 'treinado', reflexos: 'treinado' },
    current: {},
    weapons: [{ ref: 'machado' }, { ref: 'pistola' }],
    protections: [{ ref: 'leve' }],
    rituals: [],
    powers: [],
  },
} as unknown as CharacterSheet;

const AGENT_OCCULT: CharacterSheet = {
  attributes: [],
  resources: [],
  inventory: [],
  notes: 'Ocultista de exemplo: teste os botões de Conjurar.',
  system: {
    attributes: { AGI: 1, FOR: 0, INT: 2, PRE: 3, VIG: 1 },
    fields: { classe: 'ocultista', nex: '25', origem: 'academico', trilha: 'conduite' },
    skills: { ocultismo: 'treinado', vontade: 'treinado' },
    current: {},
    weapons: [{ ref: 'faca' }],
    rituals: ['eletrocussao', 'amaldicoar_arma', 'cineraria'],
    powers: [],
  },
} as unknown as CharacterSheet;

const CULTIST: CharacterSheet = {
  attributes: [],
  resources: [],
  inventory: [],
  notes: '',
  system: {
    attributes: { AGI: 2, FOR: 1, INT: 2, PRE: 2, VIG: 1 },
    fields: { classe: 'ocultista', nex: '20', origem: 'religioso' },
    skills: { ocultismo: 'treinado', luta: 'treinado' },
    current: {},
    weapons: [{ ref: 'punhal' }],
    rituals: ['eletrocussao'],
  },
} as unknown as CharacterSheet;

/**
 * Mesa de treino: uma campanha particular, pronta para testar tudo sozinho.
 * Usa o sistema de Ordem Paranormal do próprio usuário quando ele já tem um
 * (assim o livro enviado continua valendo); senão cria um a partir do modelo.
 */
@Injectable()
export class SandboxService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly campaigns: CampaignsService,
    private readonly systems: SystemsService,
    private readonly characters: CharactersService,
    private readonly npcs: NpcsService,
    private readonly maps: MapsService,
    private readonly chat: ChatService,
  ) {}

  private async existing(userId: string) {
    return withUser(this.db, userId, async (tx) => {
      const [row] = await tx
        .select({ id: c.id })
        .from(c)
        .where(and(eq(c.createdBy, userId), eq(c.sandbox, true), isNull(c.deletedAt)));
      return row?.id ?? null;
    });
  }

  async open(userId: string, ctx: RequestCtx) {
    const found = await this.existing(userId);
    if (found) return { id: found, created: false };

    const camp = await this.campaigns.create(
      userId,
      {
        name: 'Mesa de treino',
        description: 'Campanha particular para testar tudo antes de jogar de verdade.',
        gmMode: 'human',
      },
      ctx,
    );
    await withUser(this.db, userId, (tx) =>
      tx.execute(sql`select app_private.mark_sandbox(${camp.id}::uuid)`),
    );

    const mine = (await this.systems.list(userId)).filter(
      (s) => s.templateId === 'ordem_paranormal' && s.canEdit,
    );
    const system =
      mine.find((s) => s.documents.some((d) => d.status === 'ready')) ??
      mine[0] ??
      (await this.systems.create(userId, { templateId: 'ordem_paranormal' }, ctx));
    await this.systems.setCampaignSystem(userId, camp.id, system.id, ctx);

    const arthur = await this.characters.create(
      userId,
      camp.id,
      { name: 'Arthur (exemplo)', concept: 'Combatente guerreiro', color: '#7c4ff0', sheet: AGENT_COMBAT },
      ctx,
    );
    await this.characters.create(
      userId,
      camp.id,
      { name: 'Lívia (exemplo)', concept: 'Ocultista conduíte', color: '#22c55e', sheet: AGENT_OCCULT },
      ctx,
    );
    const cultist = await this.npcs.create(
      userId,
      camp.id,
      {
        name: 'Cultista Mascarado',
        appearance: 'Túnica escura e máscara de porcelana rachada.',
        publicDescription: 'Uma figura que observa das sombras.',
        color: '#b4232f',
        revealed: false,
        details: {
          personality: 'Fanático e paciente.',
          backstory: '',
          motivations: 'Abrir a passagem para o Outro Lado.',
          secrets: 'Carrega a chave do porão.',
          notes: 'NPC de exemplo com ficha completa: experimente atacar e conjurar com ele no combate.',
          stats: [],
          sheet: CULTIST,
        },
      },
      ctx,
    );
    await this.npcs.create(
      userId,
      camp.id,
      {
        name: 'Dona Marta',
        appearance: 'Senhora gentil de avental.',
        publicDescription: 'Dona da pensão onde o grupo se hospeda.',
        color: '#c9a24b',
        revealed: true,
        details: {
          personality: 'Acolhedora.',
          backstory: '',
          motivations: '',
          secrets: 'Viu o cultista entrar no porão.',
          notes: '',
          stats: [],
          sheet: {} as CharacterSheet,
        },
      },
      ctx,
    );

    // Mapa simples: uma sala com porta, para mover peças.
    const map = await this.maps.create(
      userId,
      camp.id,
      { name: 'Porão da pensão', cols: 16, rows: 10, cellLabel: '1,5 m' },
      ctx,
    );
    const cells: { x: number; y: number; terrain: 'wall' | 'door' | 'floor' }[] = [];
    for (let x = 0; x < 16; x++)
      for (let y = 0; y < 10; y++) {
        const edge = x === 0 || y === 0 || x === 15 || y === 9;
        cells.push({ x, y, terrain: edge ? (x === 7 && y === 9 ? 'door' : 'wall') : 'floor' });
      }
    await this.maps.paint(userId, camp.id, map.id, { cells });
    await this.maps.addToken(userId, camp.id, map.id, {
      kind: 'character',
      label: 'Arthur',
      color: '#7c4ff0',
      x: 7,
      y: 7,
      size: 1,
      hidden: false,
      characterId: arthur.id,
    });
    await this.maps.addToken(userId, camp.id, map.id, {
      kind: 'npc',
      label: 'Cultista',
      color: '#b4232f',
      x: 7,
      y: 2,
      size: 1,
      hidden: true,
      npcId: cultist.id,
    });
    await this.maps.update(userId, camp.id, map.id, { shared: true }, ctx);

    await this.chat.post(userId, camp.id, {
      content:
        'Bem-vindo à mesa de treino! Aqui você é mestre e dono dos personagens de exemplo. Teste: iniciar sessão, combate com criaturas do livro, atacar e conjurar na aba Ficha, e o botão "Ver como jogador".',
      visibility: 'public',
    });
    return { id: camp.id, created: true };
  }

  /** Apaga a mesa de treino atual (a próxima abertura cria uma nova, limpa). */
  async reset(userId: string, ctx: RequestCtx) {
    const found = await this.existing(userId);
    if (found) await this.campaigns.remove(userId, found, ctx);
  }
}

@Controller('sandbox')
export class SandboxController {
  constructor(private readonly svc: SandboxService) {}

  @Post()
  @HttpCode(200)
  open(@CurrentUser() u: AuthUser, @Ctx() ctx: RequestCtx) {
    return this.svc.open(u.id, ctx);
  }
  @Delete()
  @HttpCode(204)
  reset(@CurrentUser() u: AuthUser, @Ctx() ctx: RequestCtx) {
    return this.svc.reset(u.id, ctx);
  }
}
