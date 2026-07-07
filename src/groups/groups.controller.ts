import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

interface AuthUser {
  id: string;
  email: string;
}

@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async createGroup(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
    return this.groupsService.createGroup(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getMyGroups(@CurrentUser() user: AuthUser) {
    return this.groupsService.getMyGroups(user.id);
  }

  // Public route — must come before :id to avoid clash
  @Get('invite/:token/preview')
  async getInvitePreview(@Param('token') token: string) {
    return this.groupsService.getInvitePreview(token);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getGroup(@CurrentUser() user: AuthUser, @Param('id') groupId: string) {
    return this.groupsService.getGroup(user.id, groupId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async updateGroup(
    @CurrentUser() user: AuthUser,
    @Param('id') groupId: string,
    @Body() dto: Partial<CreateGroupDto>,
  ) {
    return this.groupsService.updateGroup(user.id, groupId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteGroup(@CurrentUser() user: AuthUser, @Param('id') groupId: string) {
    return this.groupsService.deleteGroup(user.id, groupId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/invite')
  async createInvite(@CurrentUser() user: AuthUser, @Param('id') groupId: string) {
    return this.groupsService.createInvite(user.id, groupId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invite/:token/accept')
  @HttpCode(HttpStatus.OK)
  async acceptInvite(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.groupsService.acceptInvite(user.id, token);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/balances')
  async getBalances(@CurrentUser() user: AuthUser, @Param('id') groupId: string) {
    return this.groupsService.getBalances(user.id, groupId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/settlements')
  async createSettlement(
    @CurrentUser() user: AuthUser,
    @Param('id') groupId: string,
    @Body() dto: CreateSettlementDto,
  ) {
    return this.groupsService.createSettlement(user.id, groupId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/settlements')
  async getSettlements(@CurrentUser() user: AuthUser, @Param('id') groupId: string) {
    return this.groupsService.getSettlements(user.id, groupId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/settlements/:settlementId/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmSettlement(
    @CurrentUser() user: AuthUser,
    @Param('id') groupId: string,
    @Param('settlementId') settlementId: string,
  ) {
    return this.groupsService.confirmSettlement(user.id, groupId, settlementId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/settlements/:settlementId')
  @HttpCode(HttpStatus.OK)
  async deleteSettlement(
    @CurrentUser() user: AuthUser,
    @Param('id') groupId: string,
    @Param('settlementId') settlementId: string,
  ) {
    return this.groupsService.deleteSettlement(user.id, groupId, settlementId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/remind')
  @HttpCode(HttpStatus.OK)
  async sendReminders(@CurrentUser() user: AuthUser, @Param('id') groupId: string) {
    return this.groupsService.sendReminders(user.id, groupId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/expenses/:expenseId/remind')
  @HttpCode(HttpStatus.OK)
  async sendExpenseReminder(
    @CurrentUser() user: AuthUser,
    @Param('id') groupId: string,
    @Param('expenseId') expenseId: string,
  ) {
    return this.groupsService.sendExpenseReminder(user.id, groupId, expenseId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.OK)
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id') groupId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.groupsService.removeMember(user.id, groupId, targetUserId);
  }
}
