import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { MetricsService } from '../metrics/metrics.service';

const CACHE_KEY = 'dashboard:payload';
const CACHE_TTL_SECONDS = 300;

const SNAPSHOT_DAYS = 90;
const RECENT_LOGS = 14;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly metrics: MetricsService,
  ) {}

  async getDashboard(userId: string, opts: { force?: boolean } = {}) {
    if (!opts.force) {
      const cached = await this.cache.getJson<unknown>(userId, CACHE_KEY);
      if (cached) return cached;
    }

    const now = new Date();
    const snapshotsFrom = new Date(now);
    snapshotsFrom.setDate(snapshotsFrom.getDate() - SNAPSHOT_DAYS);

    const [bundle, snapshots, streaks, recentLogs, goals, incomes, expenses] = await Promise.all([
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
    ]);

    const payload = {
      asOf: now.toISOString(),
      metrics: bundle.metrics,
      scenarios: bundle.scenarios,
      snapshots,
      streaks,
      recentLogs,
      goals,
      activeIncomeSources: incomes,
      activeExpenses: expenses,
    };

    await this.cache.setJson(userId, CACHE_KEY, payload, CACHE_TTL_SECONDS);
    return payload;
  }
}
