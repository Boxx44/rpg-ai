import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  createCampaignSchema,
  createInvitationSchema,
  invitationTokenSchema,
  updateCampaignSchema,
  updateMemberSchema,
  uuidSchema,
} from '@rpg-ai/shared';
import { notFound } from '../common/errors';
import { Ctx, CurrentUser, parse, type RequestCtx } from '../common/http';
import type { AuthUser } from '../common/tokens';
import { CampaignsService } from './campaigns.service';

/** IDs malformados viram 404 (sem distinguir de "não existe"). */
function id(v: string): string {
  if (!uuidSchema.safeParse(v).success) throw notFound();
  return v;
}

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly svc: CampaignsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.id);
  }

  @Post()
  create(@CurrentUser() u: AuthUser, @Body() body: unknown, @Ctx() ctx: RequestCtx) {
    return this.svc.create(u.id, parse(createCampaignSchema, body), ctx);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id') cid: string) {
    return this.svc.get(u.id, id(cid));
  }

  @Patch(':id')
  update(
    @CurrentUser() u: AuthUser,
    @Param('id') cid: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.update(u.id, id(cid), parse(updateCampaignSchema, body), ctx);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('id') cid: string, @Ctx() ctx: RequestCtx) {
    return this.svc.remove(u.id, id(cid), ctx);
  }

  @Get(':id/members')
  members(@CurrentUser() u: AuthUser, @Param('id') cid: string) {
    return this.svc.members(u.id, id(cid));
  }

  @Patch(':id/members/:userId')
  @HttpCode(204)
  updateMember(
    @CurrentUser() u: AuthUser,
    @Param('id') cid: string,
    @Param('userId') target: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.updateMember(u.id, id(cid), id(target), parse(updateMemberSchema, body), ctx);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  removeMember(
    @CurrentUser() u: AuthUser,
    @Param('id') cid: string,
    @Param('userId') target: string,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.removeMember(u.id, id(cid), id(target), ctx);
  }

  @Get(':id/invitations')
  invitations(@CurrentUser() u: AuthUser, @Param('id') cid: string) {
    return this.svc.invitations(u.id, id(cid));
  }

  @Post(':id/invitations')
  createInvitation(
    @CurrentUser() u: AuthUser,
    @Param('id') cid: string,
    @Body() body: unknown,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.createInvitation(u.id, id(cid), parse(createInvitationSchema, body ?? {}), ctx);
  }

  @Delete(':id/invitations/:invitationId')
  @HttpCode(204)
  revokeInvitation(
    @CurrentUser() u: AuthUser,
    @Param('id') cid: string,
    @Param('invitationId') iid: string,
    @Ctx() ctx: RequestCtx,
  ) {
    return this.svc.revokeInvitation(u.id, id(cid), id(iid), ctx);
  }
}

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly svc: CampaignsService) {}

  @Post(':token/accept')
  @HttpCode(200)
  accept(@CurrentUser() u: AuthUser, @Param('token') token: string) {
    return this.svc.acceptInvitation(u.id, parse(invitationTokenSchema, token));
  }
}
