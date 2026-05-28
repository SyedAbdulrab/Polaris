import { Injectable } from '@nestjs/common';
import { Expense, IncomeSource, IncomeType, Prisma } from '@prisma/client';

import { sumMonthly, sumOverPeriod, toMonthly } from '../common/frequency';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import {
  ComputedMetrics,
  MetricsBundle,
  ProjectionPoint,
  ProjectionScenario,
} from './metrics.types';

const CACHE_KEY = 'metrics:bundle';
const CACHE_TTL_SECONDS = 300;

const DEFAULT_HORIZONS = [3, 6, 12] as const;

const UPSIDE_COMMISSION_MULTIPLIER = 1.5;
const DOWNSIDE_COMMISSION_MULTIPLIER = 0.0; // worst case: zero commissions

@Injectable()
export class MetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // ---------- Public surface ----------

  async getBundle(userId: string, opts: { force?: boolean } = {}): Promise<MetricsBundle> {
    if (!opts.force) {
      const cached = await this.cache.getJson<MetricsBundle>(userId, CACHE_KEY);
      if (cached) return cached;
    }
    const bundle = await this.computeBundle(userId);
    await this.cache.setJson(userId, CACHE_KEY, bundle, CACHE_TTL_SECONDS);
    return bundle;
  }

  /**
   * Compute and persist a snapshot for the given day. Idempotent per (userId, date).
   * Used by both the cron job and the manual trigger endpoint.
   */
  async takeSnapshot(userId: string, on: Date = new Date()) {
    const day = startOfDayUTC(on);

    const [incomes, expenses] = await Promise.all([
      this.prisma.incomeSource.findMany({ where: { userId } }),
      this.prisma.expense.findMany({ where: { userId } }),
    ]);

    const m = computeCoreMetrics(incomes, expenses, day);

    return this.prisma.metricSnapshot.upsert({
      where: { userId_date: { userId, date: day } },
      create: {
        userId,
        date: day,
        projectedMRR: new Prisma.Decimal(m.projectedMRR.toFixed(2)),
        totalIncome: new Prisma.Decimal(m.totalIncome.toFixed(2)),
        totalExpenses: new Prisma.Decimal(m.totalExpenses.toFixed(2)),
        savingsRate: new Prisma.Decimal(m.savingsRate.toFixed(4)),
        netCashFlow: new Prisma.Decimal(m.netCashFlow.toFixed(2)),
        customMetrics: { monthlyIncome: m.monthlyIncome, monthlyExpenses: m.monthlyExpenses },
      },
      update: {
        projectedMRR: new Prisma.Decimal(m.projectedMRR.toFixed(2)),
        totalIncome: new Prisma.Decimal(m.totalIncome.toFixed(2)),
        totalExpenses: new Prisma.Decimal(m.totalExpenses.toFixed(2)),
        savingsRate: new Prisma.Decimal(m.savingsRate.toFixed(4)),
        netCashFlow: new Prisma.Decimal(m.netCashFlow.toFixed(2)),
        customMetrics: { monthlyIncome: m.monthlyIncome, monthlyExpenses: m.monthlyExpenses },
      },
    });
  }

  /**
   * Snapshot every user. Called by the cron job. Returns how many were written.
   */
  async takeSnapshotsForAllUsers(on: Date = new Date()): Promise<number> {
    const users = await this.prisma.user.findMany({ select: { id: true } });
    let written = 0;
    for (const u of users) {
      try {
        await this.takeSnapshot(u.id, on);
        written++;
      } catch {
        // swallow per-user errors so one bad user doesn't break the whole run
      }
    }
    return written;
  }

  listSnapshots(userId: string, opts: { from?: Date; to?: Date; limit?: number } = {}) {
    const where: Prisma.MetricSnapshotWhereInput = { userId };
    if (opts.from || opts.to) {
      where.date = {};
      if (opts.from) where.date.gte = opts.from;
      if (opts.to) where.date.lte = opts.to;
    }
    return this.prisma.metricSnapshot.findMany({
      where,
      orderBy: { date: 'asc' },
      take: opts.limit,
    });
  }

  // ---------- Internal compute ----------

  private async computeBundle(userId: string): Promise<MetricsBundle> {
    const [incomes, expenses] = await Promise.all([
      this.prisma.incomeSource.findMany({ where: { userId } }),
      this.prisma.expense.findMany({ where: { userId } }),
    ]);

    const today = new Date();
    const metrics = computeCoreMetrics(incomes, expenses, today);

    const scenarios = {
      baseline: this.scenario('baseline', incomes, expenses, today, 1),
      upside: this.scenario('upside', incomes, expenses, today, UPSIDE_COMMISSION_MULTIPLIER),
      downside: this.scenario('downside', incomes, expenses, today, DOWNSIDE_COMMISSION_MULTIPLIER),
    };

    return { metrics, scenarios };
  }

  private scenario(
    label: ProjectionScenario['label'],
    incomes: IncomeSource[],
    expenses: Expense[],
    from: Date,
    commissionMultiplier: number,
  ): ProjectionScenario {
    // Apply the multiplier to commission-type income only.
    const adjustedIncomes = incomes.map((i) =>
      i.type === IncomeType.COMMISSION
        ? { ...i, amount: new Prisma.Decimal(Number(i.amount.toString()) * commissionMultiplier) }
        : i,
    );

    const horizonMonths = DEFAULT_HORIZONS[DEFAULT_HORIZONS.length - 1];
    const points: ProjectionPoint[] = [];
    for (let m = 1; m <= horizonMonths; m++) {
      const income = sumOverPeriod(adjustedIncomes, m, from);
      const exp = sumOverPeriod(expenses, m, from);
      points.push({ month: m, income, expenses: exp, net: income - exp });
    }

    const last = points[points.length - 1];
    return { label, horizonMonths, points, endingNet: last?.net ?? 0 };
  }
}

// ---------- Pure helpers (kept outside the class for easy reuse) ----------

function startOfDayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export function computeCoreMetrics(
  incomes: IncomeSource[],
  expenses: Expense[],
  on: Date,
): ComputedMetrics {
  const monthlyIncome = sumMonthly(incomes, on);
  const monthlyExpenses = sumMonthly(expenses, on);

  // Total over the current calendar month (1-month window).
  const totalIncome = sumOverPeriod(incomes, 1, startOfMonth(on));
  const totalExpenses = sumOverPeriod(expenses, 1, startOfMonth(on));

  // One-time income inside this month should still count toward MRR-adjacent reporting,
  // but NOT toward "projectedMRR" itself, which is recurring-only.
  const projectedMRR = monthlyIncome - monthlyExpenses;

  const savingsRate =
    monthlyIncome === 0
      ? 0
      : Math.max(-1, Math.min(1, (monthlyIncome - monthlyExpenses) / monthlyIncome));

  return {
    asOf: on.toISOString(),
    monthlyIncome: round2(monthlyIncome),
    monthlyExpenses: round2(monthlyExpenses),
    projectedMRR: round2(projectedMRR),
    netCashFlow: round2(projectedMRR),
    savingsRate: Number(savingsRate.toFixed(4)),
    totalIncome: round2(totalIncome),
    totalExpenses: round2(totalExpenses),
  };
}

// One-time helpers — these don't reach far enough to deserve their own file.
function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// `toMonthly` re-exported here so other callers don't need a separate import path.
export { toMonthly };
