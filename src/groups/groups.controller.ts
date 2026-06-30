import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
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
}
