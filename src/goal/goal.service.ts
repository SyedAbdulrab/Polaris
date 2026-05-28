import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

@Injectable()
export class GoalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  list(userId: string) {
    return this.prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const item = await this.prisma.goal.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('Goal not found');
    return item;
  }

  async create(userId: string, dto: CreateGoalDto) {
    const created = await this.prisma.goal.create({
      data: {
        ...dto,
        currentAmount: dto.currentAmount ?? 0,
        userId,
      },
    });
    await this.cache.invalidateUser(userId);
    return created;
  }

  async update(userId: string, id: string, dto: UpdateGoalDto) {
    await this.findOne(userId, id);
    const updated = await this.prisma.goal.update({ where: { id }, data: dto });
    await this.cache.invalidateUser(userId);
    return updated;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.goal.delete({ where: { id } });
    await this.cache.invalidateUser(userId);
    return { success: true };
  }
}
