import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(userId: string, dto: CreateGroupDto) {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name: dto.name,
          emoji: dto.emoji,
          avatarColor: dto.avatarColor ?? '#6366f1',
          createdById: userId,
        },
      });

      await tx.groupMember.create({
        data: { groupId: group.id, userId },
      });

      return this.formatGroup(group, 1);
    });
  }

  async getMyGroups(userId: string) {
    const memberships = await this.prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      emoji: m.group.emoji,
      avatarColor: m.group.avatarColor,
      createdById: m.group.createdById,
      createdAt: m.group.createdAt,
      memberCount: m.group._count.members,
    }));
  }

  async getGroup(userId: string, groupId: string) {
    await this.assertMember(userId, groupId);

    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    return {
      id: group.id,
      name: group.name,
      emoji: group.emoji,
      avatarColor: group.avatarColor,
      createdById: group.createdById,
      createdAt: group.createdAt,
      members: group.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        joinedAt: m.joinedAt,
      })),
    };
  }

  async createInvite(userId: string, groupId: string) {
    await this.assertMember(userId, groupId);

    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = await this.prisma.groupInvite.create({
      data: { groupId, token, createdById: userId, expiresAt },
    });

    return { token: invite.token, expiresAt: invite.expiresAt };
  }

  async acceptInvite(userId: string, token: string) {
    const invite = await this.prisma.groupInvite.findUnique({ where: { token } });

    if (!invite) throw new NotFoundException('Invite not found or expired');
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new ForbiddenException('Invite link has expired');
    }

    const existingMember = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: invite.groupId, userId } },
    });

    if (existingMember) {
      throw new ConflictException('You are already a member of this group');
    }

    await this.prisma.groupMember.create({
      data: { groupId: invite.groupId, userId },
    });

    return this.getGroup(userId, invite.groupId);
  }

  async getInvitePreview(token: string) {
    const invite = await this.prisma.groupInvite.findUnique({
      where: { token },
      include: { group: { select: { id: true, name: true, emoji: true, avatarColor: true } } },
    });

    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new ForbiddenException('Invite link has expired');
    }

    return {
      groupId: invite.group.id,
      groupName: invite.group.name,
      emoji: invite.group.emoji,
      avatarColor: invite.group.avatarColor,
      expiresAt: invite.expiresAt,
    };
  }

  private async assertMember(userId: string, groupId: string) {
    const member = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!member) throw new ForbiddenException('You are not a member of this group');
  }

  private formatGroup(group: { id: string; name: string; emoji: string | null; avatarColor: string; createdById: string; createdAt: Date }, memberCount: number) {
    return {
      id: group.id,
      name: group.name,
      emoji: group.emoji,
      avatarColor: group.avatarColor,
      createdById: group.createdById,
      createdAt: group.createdAt,
      memberCount,
    };
  }
}
