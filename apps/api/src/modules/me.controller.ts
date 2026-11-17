import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import { type Database, eq, schema, withUser } from '@rpg-ai/db';
import { type MeDto, type OrganizationDto, updateProfileSchema } from '@rpg-ai/shared';
import { notFound } from '../common/errors';
import { Ctx, CurrentUser, parse, type RequestCtx } from '../common/http';
import { type AuthUser, DB } from '../common/tokens';
import { audit } from './audit';

@Controller()
export class MeController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<MeDto> {
    return withUser(this.db, user.id, async (tx) => {
      const [p] = await tx.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, user.id));
      if (!p) throw notFound('Perfil');
      return {
        id: user.id,
        email: user.email,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        locale: p.locale,
        timezone: p.timezone,
      };
    });
  }

  @Patch('me')
  async update(@CurrentUser() user: AuthUser, @Body() body: unknown, @Ctx() ctx: RequestCtx): Promise<MeDto> {
    const input = parse(updateProfileSchema, body);
    await withUser(this.db, user.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.userProfiles)
        .where(eq(schema.userProfiles.userId, user.id));
      await tx.update(schema.userProfiles).set(input).where(eq(schema.userProfiles.userId, user.id));
      await audit(tx, ctx, {
        action: 'profile.updated',
        entityType: 'user_profile',
        entityId: user.id,
        before: before && {
          displayName: before.displayName,
          locale: before.locale,
          timezone: before.timezone,
        },
        after: input,
      });
    });
    return this.me(user);
  }

  @Get('organizations')
  async organizations(@CurrentUser() user: AuthUser): Promise<OrganizationDto[]> {
    return withUser(this.db, user.id, async (tx) => {
      const rows = await tx
        .select({
          id: schema.organizations.id,
          name: schema.organizations.name,
          slug: schema.organizations.slug,
          isPersonal: schema.organizations.isPersonal,
          role: schema.organizationMembers.role,
        })
        .from(schema.organizations)
        .innerJoin(
          schema.organizationMembers,
          eq(schema.organizationMembers.organizationId, schema.organizations.id),
        )
        .where(eq(schema.organizationMembers.userId, user.id));
      return rows;
    });
  }
}
