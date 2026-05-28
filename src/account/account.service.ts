import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransactionKind } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

export interface AccountWithBalance {
  id: string;
  name: string;
  kind: string;
  currency: string;
  institution: string | null;
  openingBalance: Prisma.Decimal;
  openingDate: Date;
  isActive: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // Computed: opening + sum of inflows + sum of incoming transfers - sum of outflows - sum of outgoing transfers
  // ADJUSTMENTs are signed by `kind` semantics — we model them as positive amount with explicit kind so
  // the user enters $50 as "ADJUSTMENT" with the sign chosen elsewhere if ever needed; for now they
  // count toward inflows.
  currentBalance: number;
}

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async list(userId: string): Promise<AccountWithBalance[]> {
    const accounts = await this.prisma.account.findMany({
      where: { userId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    return Promise.all(accounts.map((a) => this.attachBalance(a)));
  }

  async findOne(userId: string, id: string): Promise<AccountWithBalance> {
    const account = await this.prisma.account.findFirst({ where: { id, userId } });
    if (!account) throw new NotFoundException('Account not found');
    return this.attachBalance(account);
  }

  async create(userId: string, dto: CreateAccountDto) {
    const created = await this.prisma.account.create({
      data: { ...dto, currency: dto.currency.toUpperCase(), userId },
    });
    await this.cache.invalidateUser(userId);
    return this.attachBalance(created);
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    await this.findOne(userId, id);
    const updated = await this.prisma.account.update({
      where: { id },
      data: { ...dto, ...(dto.currency ? { currency: dto.currency.toUpperCase() } : {}) },
    });
    await this.cache.invalidateUser(userId);
    return this.attachBalance(updated);
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.account.delete({ where: { id } });
    await this.cache.invalidateUser(userId);
    return { success: true };
  }

  // --- internals ---

  private async attachBalance(
    account: Awaited<ReturnType<PrismaService['account']['findFirst']>> & object,
  ): Promise<AccountWithBalance> {
    const balance = await this.computeBalance(account.id, Number(account.openingBalance));
    return {
      id: account.id,
      name: account.name,
      kind: account.kind,
      currency: account.currency,
      institution: account.institution,
      openingBalance: account.openingBalance,
      openingDate: account.openingDate,
      isActive: account.isActive,
      archivedAt: account.archivedAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      currentBalance: balance,
    };
  }

  /**
   * Aggregate the account's running balance from its transactions:
   *   opening
   *   + INFLOWs / ADJUSTMENTs / incoming transfers
   *   − OUTFLOWs / outgoing transfers (where this account is the source)
   *
   * Transfers are tracked from the source account's perspective. The destination account
   * receives a synthetic INFLOW recorded separately in its native currency, so we don't
   * need to sum incoming transfers here — they're modelled as INFLOW rows on the
   * destination account.
   */
  private async computeBalance(accountId: string, opening: number): Promise<number> {
    const sums = await this.prisma.transaction.groupBy({
      by: ['kind'],
      where: { accountId },
      _sum: { amount: true },
    });

    let balance = opening;
    for (const row of sums) {
      const v = row._sum.amount ? Number(row._sum.amount) : 0;
      switch (row.kind) {
        case TransactionKind.INFLOW:
        case TransactionKind.ADJUSTMENT:
          balance += v;
          break;
        case TransactionKind.OUTFLOW:
        case TransactionKind.TRANSFER:
          balance -= v;
          break;
      }
    }
    return Math.round(balance * 100) / 100;
  }
}
