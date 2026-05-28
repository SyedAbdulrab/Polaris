import { Frequency } from '@prisma/client';

// 52 weeks / 12 months. The conventional "Monthly equivalent of weekly" multiplier.
// Anything that pretends weekly == 4 monthly will under-count a year by ~4 weeks.
export const WEEKS_PER_MONTH = 52 / 12;

/**
 * Convert a recurring amount to its monthly equivalent.
 *
 * - WEEKLY  → amount * 52 / 12   (≈ 4.345)
 * - MONTHLY → amount
 * - ANNUAL  → amount / 12
 * - ONE_TIME → 0   (one-time payments are NOT recurring; they don't belong in MRR math)
 *
 * Returns a plain `number`. Callers can wrap in Prisma.Decimal if needed.
 */
export function toMonthly(amount: number, frequency: Frequency): number {
  switch (frequency) {
    case Frequency.WEEKLY:
      return amount * WEEKS_PER_MONTH;
    case Frequency.MONTHLY:
      return amount;
    case Frequency.ANNUAL:
      return amount / 12;
    case Frequency.ONE_TIME:
      return 0;
  }
}

/**
 * Whether a recurring item is "active" on a given date — i.e. between its start/end window
 * AND its `isActive` flag is true. Items without an end date are open-ended.
 */
export function isActiveOn(
  item: { startDate: Date; endDate: Date | null; isActive: boolean },
  on: Date,
): boolean {
  if (!item.isActive) return false;
  if (item.startDate > on) return false;
  if (item.endDate && item.endDate < on) return false;
  return true;
}

/**
 * Sum the monthly equivalent of a collection of items active on a given date.
 * Used by the metrics service for projected MRR / projected monthly expenses.
 */
export function sumMonthly<
  T extends {
    amount: { toString(): string } | number;
    frequency: Frequency;
    startDate: Date;
    endDate: Date | null;
    isActive: boolean;
  },
>(items: T[], on: Date = new Date()): number {
  let total = 0;
  for (const item of items) {
    if (!isActiveOn(item, on)) continue;
    const amount = typeof item.amount === 'number' ? item.amount : Number(item.amount.toString());
    total += toMonthly(amount, item.frequency);
  }
  return total;
}

/**
 * Sum the *period total* — i.e. how much the items will pay/cost in `months` months.
 * This is what 3/6/12-month projections lean on. One-time items inside the window count once.
 *
 * The window is `[from, from + months months)`.
 */
export function sumOverPeriod<
  T extends {
    amount: { toString(): string } | number;
    frequency: Frequency;
    startDate: Date;
    endDate: Date | null;
    isActive: boolean;
  },
>(items: T[], months: number, from: Date = new Date()): number {
  const to = new Date(from);
  to.setMonth(to.getMonth() + months);

  let total = 0;
  for (const item of items) {
    if (!item.isActive) continue;
    // Clip the item's active window into the projection window.
    const itemStart = item.startDate > from ? item.startDate : from;
    const itemEnd = item.endDate && item.endDate < to ? item.endDate : to;
    if (itemStart >= itemEnd) continue;

    const amount = typeof item.amount === 'number' ? item.amount : Number(item.amount.toString());

    if (item.frequency === Frequency.ONE_TIME) {
      // A one-time payment counts once if its startDate falls inside the window.
      if (item.startDate >= from && item.startDate < to) total += amount;
      continue;
    }

    const monthly = toMonthly(amount, item.frequency);
    const monthsActive =
      (itemEnd.getTime() - itemStart.getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
    total += monthly * monthsActive;
  }
  return total;
}
