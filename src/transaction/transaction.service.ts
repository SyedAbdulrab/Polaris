import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransactionKind } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ListTransactionQuery } from './dto/list-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  list(userId: string, q: ListTransactionQuery) {
    const where: Prisma.TransactionWhereInput = { userId };
    if (q.accountId) where.accountId = q.accountId;
    if (q.kind) where.kind = q.kind;
    if (q.category) where.category = q.category;
    if (q.sourceIncomeId) where.sourceIncomeId = q.sourceIncomeId;
    if (q.sourceExpenseId) where.sourceExpenseId = q.sourceExpenseId;
    if (q.from || q.to) {
      where.date = {};
      if (q.from) where.date.gte = q.from;
      if (q.to) where.date.lte = q.to;
    }
    return this.prisma.transaction.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: q.limit ?? 100,
    });
  }

  async findOne(userId: string, id: string) {
    const item = await this.prisma.transaction.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('Transaction not found');
    return item;
  }

  async create(userId: string, dto: CreateTransactionDto) {
    // Sanity-check: the account belongs to this user.
    const account = await this.prisma.account.findFirst({
      where: { id: dto.accountId, userId },
    });
    if (!account) throw new NotFoundException('Account not found');

    // Recurring-rule links must also belong to the user.
    if (dto.sourceIncomeId) {
      const inc = await this.prisma.incomeSource.findFirst({
        where: { id: dto.sourceIncomeId, userId },
        select: { id: true },
      });
      if (!inc) throw new BadRequestException('sourceIncomeId is not a valid income for this user');
    }
    if (dto.sourceExpenseId) {
      const exp = await this.prisma.expense.findFirst({
        where: { id: dto.sourceExpenseId, userId },
        select: { id: true },
      });
      if (!exp) throw new BadRequestException('sourceExpenseId is not a valid expense for this user');
    }

    if (dto.kind === TransactionKind.TRANSFER) {
      return this.createTransferPair(userId, dto, account);
    }

    if (dto.transferToAccountId || dto.transferToAmount != null) {
      throw new BadRequestException(
        'transferToAccountId / transferToAmount are only valid when kind = TRANSFER',
      );
    }

    const created = await this.prisma.transaction.create({
      data: {
        userId,
        accountId: dto.accountId,
        date: dto.date,
        amount: dto.amount,
        kind: dto.kind,
        category: dto.category,
        description: dto.description,
        sourceIncomeId: dto.sourceIncomeId,
        sourceExpenseId: dto.sourceExpenseId,
      },
    });
    await this.cache.invalidateUser(userId);
    return created;
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const existing = await this.findOne(userId, id);
    if (existing.kind === TransactionKind.TRANSFER) {
      throw new BadRequestException(
        'Transfers cannot be edited. Delete and recreate to keep both sides consistent.',
      );
    }
    const updated = await this.prisma.transaction.update({
      where: { id },
      data: {
        ...(dto.accountId ? { accountId: dto.accountId } : {}),
        ...(dto.date ? { date: dto.date } : {}),
        ...(dto.amount != null ? { amount: dto.amount } : {}),
        ...(dto.kind ? { kind: dto.kind } : {}),
        ...(dto.category != null ? { category: dto.category } : {}),
        ...(dto.description != null ? { description: dto.description } : {}),
        ...(dto.sourceIncomeId != null ? { sourceIncomeId: dto.sourceIncomeId || null } : {}),
        ...(dto.sourceExpenseId != null ? { sourceExpenseId: dto.sourceExpenseId || null } : {}),
      },
    });
    await this.cache.invalidateUser(userId);
    return updated;
  }

  async remove(userId: string, id: string) {
    const existing = await this.findOne(userId, id);
    // Transfers are pairs — remove both sides together.
    if (existing.kind === TransactionKind.TRANSFER && existing.transferToAccountId) {
      await this.prisma.$transaction([
        this.prisma.transaction.deleteMany({
          where: {
            userId,
            kind: TransactionKind.INFLOW,
            accountId: existing.transferToAccountId,
            // Match by date+amount-link. We don't store an explicit pair-id (kept the
            // schema lean), so we use the description marker we wrote at creation.
            description: pairMarker(existing.id),
          },
        }),
        this.prisma.transaction.delete({ where: { id } }),
      ]);
    } else {
      await this.prisma.transaction.delete({ where: { id } });
    }
    await this.cache.invalidateUser(userId);
    return { success: true };
  }

  // --- internals ---

  private async createTransferPair(
    userId: string,
    dto: CreateTransactionDto,
    sourceAccount: { id: string; currency: string },
  ) {
    if (!dto.transferToAccountId) {
      throw new BadRequestException('TRANSFER requires transferToAccountId');
    }
    if (dto.transferToAccountId === dto.accountId) {
      throw new BadRequestException('Cannot transfer to the same account');
    }
    const dest = await this.prisma.account.findFirst({
      where: { id: dto.transferToAccountId, userId },
    });
    if (!dest) throw new NotFoundException('Destination account not found');

    const sameCurrency = sourceAccount.currency === dest.currency;
    if (!sameCurrency && dto.transferToAmount == null) {
      throw new BadRequestException(
        `Cross-currency transfer (${sourceAccount.currency} → ${dest.currency}) requires transferToAmount`,
      );
    }
    const destAmount = dto.transferToAmount ?? dto.amount;

    return this.prisma.$transaction(async (tx) => {
      const outRow = await tx.transaction.create({
        data: {
          userId,
          accountId: dto.accountId,
          date: dto.date,
          amount: dto.amount,
          kind: TransactionKind.TRANSFER,
          category: dto.category ?? 'transfer',
          description: dto.description,
          transferToAccountId: dest.id,
        },
      });
      await tx.transaction.create({
        data: {
          userId,
          accountId: dest.id,
          date: dto.date,
          amount: destAmount,
          kind: TransactionKind.INFLOW,
          category: 'transfer',
          // Marker so we can find and delete this row when the source side is deleted.
          description: pairMarker(outRow.id),
        },
      });
      await this.cache.invalidateUser(userId);
      return outRow;
    });
  }
}

function pairMarker(sourceId: string) {
  return `__transfer_pair__:${sourceId}`;
}
