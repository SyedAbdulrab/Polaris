import { Injectable } from '@nestjs/common';

import { AccountService } from '../account/account.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { MetricsService } from '../metrics/metrics.service';

const CACHE_KEY = 'dashboard:payload';
const CACHE_TTL_SECONDS = 300;

const SNAPSHOT_DAYS = 90;
const RECENT_LOGS = 14;
const RECENT_TRANSACTIONS = 200;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly metrics: MetricsService,
    private readonly accounts: AccountService,
  ) {}

  async getDashboard(userId: string, opts: { force?: boolean } = {}) {
    if (!opts.force) {
      const cached = await this.cache.getJson<unknown>(userId, CACHE_KEY);
      if (cached) return cached;
    }

    const now = new Date();
    const snapshotsFrom = new Date(now);
    snapshotsFrom.setDate(snapshotsFrom.getDate() - SNAPSHOT_DAYS);

    // First day of the current month, used for the "this month — actual" panel.
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      bundle,
      snapshots,
      streaks,
      recentLogs,
      goals,
      incomes,
      expenses,
      accounts,
      monthTransactions,
    ] = await Promise.all([
      this.metrics.getBundle(userId),
      this.metrics.listSnapshots(userId, { from: snapshotsFrom }),
      this.prisma.streak.findMany({ where: { userId }, orderBy: { currentCount: 'desc' } }),
      this.prisma.logEntry.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: RECENT_LOGS,
      }),
      this.prisma.goal.findMany({ where: { userId }, orderBy: { deadline: 'asc' } }),
      this.prisma.incomeSource.findMany({ where: { userId, isActive: true } }),
      this.prisma.expense.findMany({ where: { userId, isActive: true } }),
      this.accounts.list(userId),
      this.prisma.transaction.findMany({
        where: { userId, date: { gte: monthStart } },
        orderBy: { date: 'desc' },
        take: RECENT_TRANSACTIONS,
      }),
    ]);

    const payload = {
      asOf: now.toISOString(),
      monthStart: monthStart.toISOString(),
      metrics: bundle.metrics,
      scenarios: bundle.scenarios,
      snapshots,
      streaks,
      recentLogs,
      goals,
      activeIncomeSources: incomes,
      activeExpenses: expenses,
      accounts,
      monthTransactions,
    };

    await this.cache.setJson(userId, CACHE_KEY, payload, CACHE_TTL_SECONDS);
    return payload;
  }
}
