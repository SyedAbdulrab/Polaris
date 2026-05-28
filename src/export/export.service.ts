import { Injectable, NotFoundException } from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import PDFDocument from 'pdfkit';

import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';

export type CsvType = 'income' | 'expenses' | 'goals' | 'streaks' | 'logs' | 'snapshots';

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  // ---------- JSON: full data dump for one user ----------

  async fullJson(userId: string) {
    const [user, incomes, expenses, goals, streaks, logs, snapshots] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      this.prisma.incomeSource.findMany({ where: { userId } }),
      this.prisma.expense.findMany({ where: { userId } }),
      this.prisma.goal.findMany({ where: { userId } }),
      this.prisma.streak.findMany({ where: { userId } }),
      this.prisma.logEntry.findMany({ where: { userId } }),
      this.prisma.metricSnapshot.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
    ]);

    if (!user) throw new NotFoundException('User not found');

    return {
      exportedAt: new Date().toISOString(),
      user,
      incomes,
      expenses,
      goals,
      streaks,
      logs,
      snapshots,
    };
  }

  // ---------- CSV: one entity type at a time ----------

  async csv(userId: string, type: CsvType): Promise<string> {
    const rows = await this.fetchForCsv(userId, type);
    if (rows.length === 0) {
      return '\n'; // empty file with a newline so curl > file.csv doesn't choke
    }
    return stringify(rows, { header: true });
  }

  private async fetchForCsv(userId: string, type: CsvType): Promise<Record<string, unknown>[]> {
    switch (type) {
      case 'income': {
        const rows = await this.prisma.incomeSource.findMany({ where: { userId } });
        return rows.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          amount: r.amount.toString(),
          frequency: r.frequency,
          startDate: r.startDate.toISOString(),
          endDate: r.endDate?.toISOString() ?? '',
          isActive: r.isActive,
        }));
      }
      case 'expenses': {
        const rows = await this.prisma.expense.findMany({ where: { userId } });
        return rows.map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          amount: r.amount.toString(),
          frequency: r.frequency,
          startDate: r.startDate.toISOString(),
          endDate: r.endDate?.toISOString() ?? '',
          isActive: r.isActive,
        }));
      }
      case 'goals': {
        const rows = await this.prisma.goal.findMany({ where: { userId } });
        return rows.map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          targetAmount: r.targetAmount.toString(),
          currentAmount: r.currentAmount.toString(),
          deadline: r.deadline?.toISOString() ?? '',
        }));
      }
      case 'streaks': {
        const rows = await this.prisma.streak.findMany({ where: { userId } });
        return rows.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          currentCount: r.currentCount,
          longestCount: r.longestCount,
          lastLoggedDate: r.lastLoggedDate?.toISOString() ?? '',
        }));
      }
      case 'logs': {
        const rows = await this.prisma.logEntry.findMany({ where: { userId } });
        return rows.map((r) => ({
          id: r.id,
          date: r.date.toISOString(),
          mood: r.mood ?? '',
          note: r.note ?? '',
          tags: Array.isArray(r.tags) ? (r.tags as string[]).join('|') : '',
          value: r.value?.toString() ?? '',
        }));
      }
      case 'snapshots': {
        const rows = await this.prisma.metricSnapshot.findMany({
          where: { userId },
          orderBy: { date: 'asc' },
        });
        return rows.map((r) => ({
          date: r.date.toISOString(),
          projectedMRR: r.projectedMRR.toString(),
          totalIncome: r.totalIncome.toString(),
          totalExpenses: r.totalExpenses.toString(),
          savingsRate: r.savingsRate.toString(),
          netCashFlow: r.netCashFlow.toString(),
        }));
      }
    }
  }

  // ---------- PDF: monthly summary ----------

  async monthlySummaryPdf(userId: string, year: number, month: number): Promise<Buffer> {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));

    const [user, bundle, snapshots, topExpenses, recentLogs] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
      this.metrics.getBundle(userId, { force: true }),
      this.prisma.metricSnapshot.findMany({
        where: { userId, date: { gte: monthStart, lt: monthEnd } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.expense.findMany({
        where: { userId, isActive: true },
        orderBy: { amount: 'desc' },
        take: 5,
      }),
      this.prisma.logEntry.findMany({
        where: { userId, date: { gte: monthStart, lt: monthEnd } },
        orderBy: { date: 'desc' },
        take: 10,
      }),
    ]);

    if (!user) throw new NotFoundException('User not found');

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];
        doc.on('data', (c) => chunks.push(c as Buffer));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ----- Header -----
        doc.fontSize(22).text('Polaris — Monthly Summary', { align: 'left' });
        doc.moveDown(0.2);
        doc
          .fontSize(10)
          .fillColor('#666')
          .text(`${user.name ?? user.email}`);
        doc
          .fontSize(10)
          .fillColor('#666')
          .text(`${monthStart.toLocaleString('en', { month: 'long', year: 'numeric' })}`);
        doc.moveDown(1);
        doc.fillColor('black');

        // ----- Headline metrics -----
        const m = bundle.metrics;
        doc.fontSize(14).text('Headline metrics');
        doc.moveDown(0.3);
        doc.fontSize(11);
        const lines = [
          ['Projected MRR', formatMoney(m.projectedMRR)],
          ['Monthly income', formatMoney(m.monthlyIncome)],
          ['Monthly expenses', formatMoney(m.monthlyExpenses)],
          ['Savings rate', `${(m.savingsRate * 100).toFixed(1)}%`],
          ['Total income (this month)', formatMoney(m.totalIncome)],
          ['Total expenses (this month)', formatMoney(m.totalExpenses)],
        ];
        for (const [label, value] of lines) doc.text(`  ${label.padEnd(32, ' ')}${value}`);
        doc.moveDown(1);

        // ----- Scenarios -----
        doc.fontSize(14).text('12-month scenarios (ending net)');
        doc.moveDown(0.3);
        doc.fontSize(11);
        doc.text(`  Baseline:  ${formatMoney(bundle.scenarios.baseline.endingNet)}`);
        doc.text(`  Upside:    ${formatMoney(bundle.scenarios.upside.endingNet)}`);
        doc.text(`  Downside:  ${formatMoney(bundle.scenarios.downside.endingNet)}`);
        doc.moveDown(1);

        // ----- Top expenses -----
        doc.fontSize(14).text('Top active expenses');
        doc.moveDown(0.3);
        doc.fontSize(11);
        for (const e of topExpenses) {
          doc.text(
            `  ${e.name.padEnd(28, ' ')}${formatMoney(Number(e.amount.toString()))} / ${e.frequency}`,
          );
        }
        if (topExpenses.length === 0) doc.text('  (none)');
        doc.moveDown(1);

        // ----- Snapshot count -----
        doc.fontSize(14).text('Snapshots written this month');
        doc.moveDown(0.3);
        doc.fontSize(11).text(`  ${snapshots.length}`);
        doc.moveDown(1);

        // ----- Recent log entries -----
        doc.fontSize(14).text('Recent log entries');
        doc.moveDown(0.3);
        doc.fontSize(10);
        if (recentLogs.length === 0) doc.text('  (none)');
        for (const l of recentLogs) {
          const tags = Array.isArray(l.tags) ? (l.tags as string[]).join(', ') : '';
          doc
            .fillColor('#444')
            .text(
              `  ${l.date.toISOString().slice(0, 10)}` +
                (l.mood != null ? ` · mood ${l.mood}` : '') +
                (tags ? ` · [${tags}]` : ''),
            );
          if (l.note) {
            doc.fillColor('black').text(`    ${l.note}`, { indent: 2 });
          }
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

function formatMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
