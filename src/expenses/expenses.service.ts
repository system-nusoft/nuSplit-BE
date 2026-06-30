import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto, SplitMethod, SplitParticipantDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

interface SplitResult {
  userId: string;
  amountOwed: Decimal;
  shareValue: Decimal | null;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async createExpense(userId: string, groupId: string, dto: CreateExpenseDto) {
    await this.assertMember(userId, groupId);
    await this.assertMember(dto.paidById, groupId);

    const totalCents = Math.round(parseFloat(dto.amount) * 100);
    if (totalCents <= 0) throw new BadRequestException('Amount must be greater than 0');

    const splits = this.computeSplits(dto.splitMethod, dto.participants, totalCents);

    const { id: expenseId } = await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          groupId,
          paidById: dto.paidById,
          description: dto.description,
          amount: new Decimal(dto.amount),
          currency: dto.currency ?? 'USD',
          splitMethod: dto.splitMethod,
        },
      });

      await tx.expenseSplit.createMany({
        data: splits.map((s) => ({
          expenseId: expense.id,
          userId: s.userId,
          amountOwed: s.amountOwed,
          shareValue: s.shareValue,
        })),
      });

      return expense;
    });

    return this.getExpense(groupId, expenseId);
  }

  async getExpenses(userId: string, groupId: string, page = 1, limit = 20) {
    await this.assertMember(userId, groupId);

    const skip = (page - 1) * limit;
    const [expenses, total] = await Promise.all([
      this.prisma.expense.findMany({
        where: { groupId },
        include: {
          paidBy: { select: { id: true, name: true, email: true } },
          splits: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.expense.count({ where: { groupId } }),
    ]);

    return { data: expenses, total, page, limit };
  }

  async updateExpense(userId: string, groupId: string, expenseId: string, dto: UpdateExpenseDto) {
    await this.assertMember(userId, groupId);
    const expense = await this.prisma.expense.findFirst({ where: { id: expenseId, groupId } });
    if (!expense) throw new NotFoundException('Expense not found');

    const finalMethod = dto.splitMethod ?? expense.splitMethod;
    const finalAmount = dto.amount ?? expense.amount.toString();
    const totalCents = Math.round(parseFloat(finalAmount) * 100);

    if (dto.participants && dto.splitMethod) {
      const splits = this.computeSplits(finalMethod as SplitMethod, dto.participants, totalCents);

      await this.prisma.$transaction(async (tx) => {
        await tx.expenseSplit.deleteMany({ where: { expenseId } });

        await tx.expense.update({
          where: { id: expenseId },
          data: {
            ...(dto.description && { description: dto.description }),
            ...(dto.amount && { amount: new Decimal(dto.amount) }),
            ...(dto.currency && { currency: dto.currency }),
            ...(dto.paidById && { paidById: dto.paidById }),
            ...(dto.splitMethod && { splitMethod: dto.splitMethod }),
          },
        });

        await tx.expenseSplit.createMany({
          data: splits.map((s) => ({
            expenseId,
            userId: s.userId,
            amountOwed: s.amountOwed,
            shareValue: s.shareValue,
          })),
        });
      });

      return this.getExpense(groupId, expenseId);
    }

    await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        ...(dto.description && { description: dto.description }),
        ...(dto.amount && { amount: new Decimal(dto.amount) }),
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.paidById && { paidById: dto.paidById }),
      },
    });

    return this.getExpense(groupId, expenseId);
  }

  async deleteExpense(userId: string, groupId: string, expenseId: string) {
    await this.assertMember(userId, groupId);
    const expense = await this.prisma.expense.findFirst({ where: { id: expenseId, groupId } });
    if (!expense) throw new NotFoundException('Expense not found');
    await this.prisma.expense.delete({ where: { id: expenseId } });
  }

  private async getExpense(groupId: string, expenseId: string) {
    return this.prisma.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        splits: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
  }

  private computeSplits(
    method: SplitMethod,
    participants: SplitParticipantDto[],
    totalCents: number,
  ): SplitResult[] {
    switch (method) {
      case SplitMethod.EQUAL:
        return this.splitEqual(participants, totalCents);
      case SplitMethod.SHARES:
        return this.splitByShares(participants, totalCents);
      case SplitMethod.PERCENTAGE:
        return this.splitByPercentage(participants, totalCents);
      case SplitMethod.CUSTOM:
        return this.splitCustom(participants, totalCents);
    }
  }

  private splitEqual(participants: SplitParticipantDto[], totalCents: number): SplitResult[] {
    const n = participants.length;
    const base = Math.floor(totalCents / n);
    const remainder = totalCents - base * n;

    return participants.map((p, i) => ({
      userId: p.userId,
      amountOwed: new Decimal((base + (i < remainder ? 1 : 0)) / 100),
      shareValue: null,
    }));
  }

  private splitByShares(participants: SplitParticipantDto[], totalCents: number): SplitResult[] {
    const shares = participants.map((p) => {
      const v = p.value ?? 1;
      if (v <= 0) throw new BadRequestException('Share values must be greater than 0');
      return v;
    });
    const totalShares = shares.reduce((a, b) => a + b, 0);

    const cents = participants.map((_, i) => Math.floor((shares[i] / totalShares) * totalCents));
    const allocated = cents.reduce((a, b) => a + b, 0);
    const remainder = totalCents - allocated;

    return participants.map((p, i) => ({
      userId: p.userId,
      amountOwed: new Decimal((cents[i] + (i < remainder ? 1 : 0)) / 100),
      shareValue: new Decimal(shares[i]),
    }));
  }

  private splitByPercentage(participants: SplitParticipantDto[], totalCents: number): SplitResult[] {
    const pcts = participants.map((p) => {
      const v = p.value ?? 0;
      if (v <= 0) throw new BadRequestException('Percentages must be greater than 0');
      return v;
    });
    const totalPct = pcts.reduce((a, b) => a + b, 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      throw new BadRequestException(`Percentages must sum to 100 (got ${totalPct})`);
    }

    const cents = pcts.map((pct) => Math.floor((pct / 100) * totalCents));
    const allocated = cents.reduce((a, b) => a + b, 0);
    const remainder = totalCents - allocated;

    return participants.map((p, i) => ({
      userId: p.userId,
      amountOwed: new Decimal((cents[i] + (i < remainder ? 1 : 0)) / 100),
      shareValue: new Decimal(pcts[i]),
    }));
  }

  private splitCustom(participants: SplitParticipantDto[], totalCents: number): SplitResult[] {
    const amounts = participants.map((p) => {
      const v = p.value ?? 0;
      if (v < 0) throw new BadRequestException('Custom amounts cannot be negative');
      return Math.round(v * 100);
    });
    const sumCents = amounts.reduce((a, b) => a + b, 0);
    if (sumCents !== totalCents) {
      throw new BadRequestException(
        `Custom amounts must sum to the total (expected ${totalCents / 100}, got ${sumCents / 100})`,
      );
    }

    return participants.map((p, i) => ({
      userId: p.userId,
      amountOwed: new Decimal(amounts[i] / 100),
      shareValue: null,
    }));
  }

  private async assertMember(userId: string, groupId: string) {
    const member = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!member) throw new ForbiddenException('You are not a member of this group');
  }
}
