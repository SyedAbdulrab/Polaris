import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { CreateStreakDto } from './dto/create-streak.dto';
import { UpdateStreakDto } from './dto/update-streak.dto';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class StreakService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  list(userId: string) {
    return this.prisma.streak.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const item = await this.prisma.streak.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('Streak not found');
    return item;
  }

  async create(userId: string, dto: CreateStreakDto) {
    const created = await this.prisma.streak.create({ data: { ...dto, userId } });
    await this.cache.invalidateUser(userId);
    return created;
  }

  async update(userId: string, id: string, dto: UpdateStreakDto) {
    await this.findOne(userId, id);
    const updated = await this.prisma.streak.update({ where: { id }, data: dto });
    await this.cache.invalidateUser(userId);
    return updated;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.streak.delete({ where: { id } });
    await this.cache.invalidateUser(userId);
    return { success: true };
  }

  /**
   * Log "today" against a streak.
   *  - If lastLoggedDate is today already → no-op (return current state).
   *  - If lastLoggedDate was yesterday    → increment currentCount.
   *  - If lastLoggedDate was older / null → reset to 1.
   * longestCount is updated whenever currentCount exceeds it.
   */
  async logToday(userId: string, id: string) {
    const streak = await this.findOne(userId, id);
    const today = startOfDayUTC(new Date());

    let currentCount = streak.currentCount;
    if (streak.lastLoggedDate) {
      const last = startOfDayUTC(streak.lastLoggedDate);
      const diff = (today.getTime() - last.getTime()) / ONE_DAY_MS;
      if (diff === 0) return streak; // already logged today
      currentCount = diff === 1 ? streak.currentCount + 1 : 1;
    } else {
      currentCount = 1;
    }

    const longestCount = Math.max(streak.longestCount, currentCount);

    const updated = await this.prisma.streak.update({
      where: { id },
      data: { currentCount, longestCount, lastLoggedDate: today },
    });
    await this.cache.invalidateUser(userId);
    return updated;
  }

  async breakStreak(userId: string, id: string) {
    await this.findOne(userId, id);
    const updated = await this.prisma.streak.update({
      where: { id },
      data: { currentCount: 0, lastLoggedDate: null },
    });
    await this.cache.invalidateUser(userId);
    return updated;
  }
}

function startOfDayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
