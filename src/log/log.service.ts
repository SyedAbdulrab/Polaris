import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { CreateLogDto } from './dto/create-log.dto';
import { ListLogQuery } from './dto/list-log.dto';
import { UpdateLogDto } from './dto/update-log.dto';

@Injectable()
export class LogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  list(userId: string, q: ListLogQuery = {}) {
    const where: Prisma.LogEntryWhereInput = { userId };
    if (q.from || q.to) {
      where.date = {};
      if (q.from) where.date.gte = q.from;
      if (q.to) where.date.lte = q.to;
    }
    if (q.tags?.length) {
      // tags is JSON; we filter in JS after a coarse DB fetch. For a single-user app this
      // is fine; if it ever grows, switch to a Postgres GIN index on (tags::jsonb).
      // Keep the DB query minimal here:
    }
    return this.prisma.logEntry
      .findMany({
        where,
        orderBy: { date: 'desc' },
        take: q.limit ?? 100,
      })
      .then((rows) => {
        if (!q.tags?.length) return rows;
        const wanted = new Set(q.tags);
        return rows.filter((r) => {
          const tags = Array.isArray(r.tags) ? (r.tags as string[]) : [];
          return tags.some((t) => wanted.has(t));
        });
      });
  }

  async findOne(userId: string, id: string) {
    const item = await this.prisma.logEntry.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('Log entry not found');
    return item;
  }

  async create(userId: string, dto: CreateLogDto) {
    const created = await this.prisma.logEntry.create({
      data: {
        userId,
        date: dto.date,
        mood: dto.mood ?? null,
        note: dto.note ?? null,
        tags: dto.tags ?? Prisma.JsonNull,
        value: dto.value ?? null,
      },
    });
    await this.cache.invalidateUser(userId);
    return created;
  }

  async update(userId: string, id: string, dto: UpdateLogDto) {
    await this.findOne(userId, id);
    const data: Prisma.LogEntryUpdateInput = {};
    if (dto.date !== undefined) data.date = dto.date;
    if (dto.mood !== undefined) data.mood = dto.mood;
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.tags !== undefined) data.tags = dto.tags as unknown as Prisma.InputJsonValue;
    if (dto.value !== undefined) data.value = dto.value;
    const updated = await this.prisma.logEntry.update({ where: { id }, data });
    await this.cache.invalidateUser(userId);
    return updated;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.logEntry.delete({ where: { id } });
    await this.cache.invalidateUser(userId);
    return { success: true };
  }
}
