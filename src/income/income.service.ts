import { Injectable, NotFoundException } from '@nestjs/common';

import { CacheService } from '../redis/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIncomeDto } from './dto/create-income.dto';
import { UpdateIncomeDto } from './dto/update-income.dto';

@Injectable()
export class IncomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  list(userId: string) {
    return this.prisma.incomeSource.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const item = await this.prisma.incomeSource.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('Income source not found');
    return item;
  }

  async create(userId: string, dto: CreateIncomeDto) {
    const created = await this.prisma.incomeSource.create({
      data: { ...dto, userId },
    });
    await this.cache.invalidateUser(userId);
    return created;
  }

  async update(userId: string, id: string, dto: UpdateIncomeDto) {
    await this.findOne(userId, id);
    const updated = await this.prisma.incomeSource.update({
      where: { id },
      data: dto,
    });
    await this.cache.invalidateUser(userId);
    return updated;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.incomeSource.delete({ where: { id } });
    await this.cache.invalidateUser(userId);
    return { success: true };
  }
}
