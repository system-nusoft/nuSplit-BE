import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CurrencyService } from '../currency/currency.service';
import { MailService } from '../mail/mail.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { v4 as uuidv4 } from 'uuid';

interface MemberInfo {
  id: string;
  name: string | null;
  email: string;
  phoneNumber: string | null;
}

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currencyService: CurrencyService,
    private readonly mailService: MailService,
  ) {}

  async createGroup(userId: string, dto: CreateGroupDto) {
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name: dto.name,
          emoji: dto.emoji,
          avatarColor: dto.avatarColor ?? '#6366f1',
          baseCurrency: dto.baseCurrency ?? 'USD',
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
      baseCurrency: group.baseCurrency,
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

  async updateGroup(userId: string, groupId: string, dto: Partial<{ name: string; emoji: string; avatarColor: string; baseCurrency: string }>) {
    const group = await this.prisma.group.findUniqueOrThrow({ where: { id: groupId } });
    if (group.createdById !== userId) throw new ForbiddenException('Only the group creator can edit group settings');

    const updated = await this.prisma.group.update({
      where: { id: groupId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.emoji !== undefined && { emoji: dto.emoji || null }),
        ...(dto.avatarColor && { avatarColor: dto.avatarColor }),
        ...(dto.baseCurrency && { baseCurrency: dto.baseCurrency.toUpperCase() }),
      },
    });

    const memberCount = await this.prisma.groupMember.count({ where: { groupId } });
    return this.formatGroup(updated, memberCount);
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

  async getBalances(userId: string, groupId: string) {
    await this.assertMember(userId, groupId);

    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { baseCurrency: true },
    });

    const [expenses, confirmedSettlements, allSettlements, members] = await Promise.all([
      this.prisma.expense.findMany({
        where: { groupId },
        include: { splits: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.settlement.findMany({
        where: { groupId, status: 'CONFIRMED' },
        include: {
          from: { select: { id: true, name: true, email: true } },
          to: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.settlement.findMany({
        where: { groupId },
        include: {
          from: { select: { id: true, name: true, email: true } },
          to: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.groupMember.findMany({
        where: { groupId },
        include: { user: { select: { id: true, name: true, email: true, phoneNumber: true } } },
      }),
    ]);

    // Net balance per person: positive = owed money, negative = owes money
    const net = new Map<string, number>();
    for (const m of members) net.set(m.userId, 0);

    // Pre-fetch FX rates for cross-currency expenses and settlements
    const rateCache = new Map<string, number>();
    const needsRate = (currency: string) =>
      currency !== group.baseCurrency && !rateCache.has(`${currency}:${group.baseCurrency}`);

    for (const expense of expenses) {
      if (!expense.amountInBase && needsRate(expense.currency)) {
        const key = `${expense.currency}:${group.baseCurrency}`;
        rateCache.set(key, await this.currencyService.getRate(expense.currency, group.baseCurrency));
      }
    }
    for (const s of confirmedSettlements) {
      if (needsRate(s.currency)) {
        const key = `${s.currency}:${group.baseCurrency}`;
        rateCache.set(key, await this.currencyService.getRate(s.currency, group.baseCurrency));
      }
    }

    for (const expense of expenses) {
      const expenseTotal = parseFloat(expense.amount.toString());
      let baseTotal: number;
      if (expense.amountInBase) {
        baseTotal = parseFloat(expense.amountInBase.toString());
      } else if (expense.currency !== group.baseCurrency) {
        const rate = rateCache.get(`${expense.currency}:${group.baseCurrency}`) ?? 1;
        baseTotal = expenseTotal * rate;
      } else {
        baseTotal = expenseTotal;
      }
      const scale = expenseTotal > 0 ? baseTotal / expenseTotal : 1;

      for (const split of expense.splits) {
        if (split.userId === expense.paidById) continue;
        const amountInBase = parseFloat(split.amountOwed.toString()) * scale;
        net.set(expense.paidById, (net.get(expense.paidById) ?? 0) + amountInBase);
        net.set(split.userId, (net.get(split.userId) ?? 0) - amountInBase);
      }
    }

    // Snapshot expense-only balances to determine the actual debtor for each settlement,
    // regardless of whether the debtor or creditor initiated the settlement record.
    // Also used to cap the settlement effect so it never creates a phantom balance
    // when expenses have been deleted.
    const expenseOnlyNet = new Map(net);

    for (const s of confirmedSettlements) {
      let amount = parseFloat(s.amount.toString());
      if (s.currency !== group.baseCurrency) {
        amount *= rateCache.get(`${s.currency}:${group.baseCurrency}`) ?? 1;
      }
      const fromExpNet = expenseOnlyNet.get(s.fromUserId) ?? 0;
      const toExpNet = expenseOnlyNet.get(s.toUserId) ?? 0;
      // The actual debtor is whoever has the lower expense-only balance
      const [debtorId, creditorId] = fromExpNet <= toExpNet
        ? [s.fromUserId, s.toUserId]
        : [s.toUserId, s.fromUserId];
      // Cap at the expense-based debt so deleted expenses don't leave phantom balances
      const debtAmount = Math.abs(Math.min(expenseOnlyNet.get(debtorId) ?? 0, 0));
      const effectiveAmount = Math.min(amount, debtAmount);
      if (effectiveAmount > 0) {
        net.set(debtorId, (net.get(debtorId) ?? 0) + effectiveAmount);
        net.set(creditorId, (net.get(creditorId) ?? 0) - effectiveAmount);
      }
    }

    const memberMap = new Map<string, MemberInfo>(
      members.map((m) => [m.userId, m.user]),
    );

    const balances = members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      amount: Math.round((net.get(m.userId) ?? 0) * 100) / 100,
    }));

    return {
      balances,
      simplifiedTransactions: this.simplifyDebts(net, memberMap),
      settlements: allSettlements.map((s) => ({
        id: s.id,
        fromUserId: s.fromUserId,
        fromName: s.from.name ?? s.from.email,
        toUserId: s.toUserId,
        toName: s.to.name ?? s.to.email,
        amount: s.amount,
        currency: s.currency,
        status: s.status,
        note: s.note,
        createdAt: s.createdAt,
        confirmedAt: s.confirmedAt,
      })),
    };
  }

  async createSettlement(userId: string, groupId: string, dto: CreateSettlementDto) {
    await this.assertMember(userId, groupId);
    await this.assertMember(dto.toUserId, groupId);

    if (userId === dto.toUserId) {
      throw new BadRequestException('Cannot settle up with yourself');
    }

    const amount = parseFloat(dto.amount);
    if (amount <= 0) throw new BadRequestException('Amount must be greater than 0');

    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { baseCurrency: true },
    });

    const settlement = await this.prisma.settlement.create({
      data: {
        groupId,
        fromUserId: userId,
        toUserId: dto.toUserId,
        amount: new Decimal(dto.amount),
        currency: dto.currency ?? group.baseCurrency,
        note: dto.note,
      },
      include: {
        from: { select: { id: true, name: true, email: true } },
        to: { select: { id: true, name: true, email: true } },
      },
    });

    return settlement;
  }

  async getSettlements(userId: string, groupId: string) {
    await this.assertMember(userId, groupId);

    return this.prisma.settlement.findMany({
      where: { groupId },
      include: {
        from: { select: { id: true, name: true, email: true } },
        to: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async confirmSettlement(userId: string, groupId: string, settlementId: string) {
    await this.assertMember(userId, groupId);

    const settlement = await this.prisma.settlement.findUniqueOrThrow({ where: { id: settlementId } });
    if (settlement.groupId !== groupId) throw new ForbiddenException('Settlement not in this group');
    if (settlement.toUserId !== userId) throw new ForbiddenException('Only the payment receiver can confirm');
    if (settlement.status === 'CONFIRMED') throw new BadRequestException('Already confirmed');

    return this.prisma.settlement.update({
      where: { id: settlementId },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
      include: {
        from: { select: { id: true, name: true, email: true } },
        to: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async deleteSettlement(userId: string, groupId: string, settlementId: string) {
    await this.assertMember(userId, groupId);

    const settlement = await this.prisma.settlement.findUniqueOrThrow({ where: { id: settlementId } });
    if (settlement.groupId !== groupId) throw new ForbiddenException('Settlement not in this group');
    if (settlement.fromUserId !== userId) throw new ForbiddenException('Only the payer can delete a settlement');
    if (settlement.status === 'CONFIRMED') throw new BadRequestException('Cannot delete a confirmed settlement');

    await this.prisma.settlement.delete({ where: { id: settlementId } });
    return { success: true };
  }

  async sendReminders(userId: string, groupId: string) {
    await this.assertMember(userId, groupId);

    const group = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { name: true, baseCurrency: true },
    });

    const balancesData = await this.getBalances(userId, groupId);
    const sender = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const senderName = sender.name || sender.email;

    let sent = 0;
    for (const tx of balancesData.simplifiedTransactions) {
      if (tx.toUserId !== userId) continue; // only send reminders where current user is the creditor
      const debtor = await this.prisma.user.findUnique({
        where: { id: tx.fromUserId },
        select: { email: true, name: true },
      });
      if (!debtor) continue;
      await this.mailService.sendBalanceReminder(
        debtor.email,
        debtor.name ?? debtor.email,
        group.name,
        tx.amount.toFixed(2),
        group.baseCurrency,
        senderName,
      );
      sent++;
    }

    return { sent };
  }

  async deleteGroup(userId: string, groupId: string) {
    const group = await this.prisma.group.findUniqueOrThrow({ where: { id: groupId } });
    if (group.createdById !== userId) throw new ForbiddenException('Only the creator can delete this group');

    await this.prisma.$transaction([
      this.prisma.comment.deleteMany({ where: { expense: { groupId } } }),
      this.prisma.expenseSplit.deleteMany({ where: { expense: { groupId } } }),
      this.prisma.expense.deleteMany({ where: { groupId } }),
      this.prisma.settlement.deleteMany({ where: { groupId } }),
      this.prisma.groupInvite.deleteMany({ where: { groupId } }),
      this.prisma.groupMember.deleteMany({ where: { groupId } }),
      this.prisma.group.delete({ where: { id: groupId } }),
    ]);

    return { success: true };
  }

  async removeMember(userId: string, groupId: string, targetUserId: string) {
    const group = await this.prisma.group.findUniqueOrThrow({ where: { id: groupId } });

    const isSelf = userId === targetUserId;
    const isCreator = group.createdById === userId;

    if (!isSelf && !isCreator) throw new ForbiddenException('Only the group creator can remove members');
    if (isCreator && isSelf) throw new BadRequestException('Group creator cannot leave the group');

    await this.assertMember(targetUserId, groupId);

    await this.prisma.groupMember.delete({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });

    return { success: true };
  }

  private simplifyDebts(
    net: Map<string, number>,
    memberMap: Map<string, MemberInfo>,
  ) {
    const creditors: { id: string; amount: number }[] = [];
    const debtors: { id: string; amount: number }[] = [];

    for (const [id, amount] of net) {
      const rounded = Math.round(amount * 100) / 100;
      if (rounded > 0.005) creditors.push({ id, amount: rounded });
      else if (rounded < -0.005) debtors.push({ id, amount: -rounded });
    }

    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const transactions: {
      fromUserId: string;
      fromName: string;
      fromPhone: string | null;
      toUserId: string;
      toName: string;
      toPhone: string | null;
      amount: number;
    }[] = [];

    let ci = 0;
    let di = 0;

    while (ci < creditors.length && di < debtors.length) {
      const credit = creditors[ci];
      const debt = debtors[di];
      const amount = Math.min(credit.amount, debt.amount);

      if (amount > 0.005) {
        const from = memberMap.get(debt.id)!;
        const to = memberMap.get(credit.id)!;
        transactions.push({
          fromUserId: debt.id,
          fromName: from.name ?? from.email,
          fromPhone: from.phoneNumber,
          toUserId: credit.id,
          toName: to.name ?? to.email,
          toPhone: to.phoneNumber,
          amount: Math.round(amount * 100) / 100,
        });
      }

      credit.amount = Math.round((credit.amount - amount) * 100) / 100;
      debt.amount = Math.round((debt.amount - amount) * 100) / 100;

      if (credit.amount < 0.005) ci++;
      if (debt.amount < 0.005) di++;
    }

    return transactions;
  }

  private async assertMember(userId: string, groupId: string) {
    const member = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!member) throw new ForbiddenException('You are not a member of this group');
  }

  private formatGroup(group: { id: string; name: string; emoji: string | null; avatarColor: string; baseCurrency: string; createdById: string; createdAt: Date }, memberCount: number) {
    return {
      id: group.id,
      name: group.name,
      emoji: group.emoji,
      avatarColor: group.avatarColor,
      baseCurrency: group.baseCurrency,
      createdById: group.createdById,
      createdAt: group.createdAt,
      memberCount,
    };
  }
}
