import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../redis/cache.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

@Injectable()
export class ExpenseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  list(userId: string) {
    return this.prisma.expense.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const item = await this.prisma.expense.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('Expense not found');
    return item;
  }

  async create(userId: string, dto: CreateExpenseDto) {
    const created = await this.prisma.expense.create({ data: { ...dto, userId } });
    await this.cache.invalidateUser(userId);
    return created;
  }

  async update(userId: string, id: string, dto: UpdateExpenseDto) {
    await this.findOne(userId, id);
    const updated = await this.prisma.expense.update({ where: { id }, data: dto });
    await this.cache.invalidateUser(userId);
    return updated;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.expense.delete({ where: { id } });
    await this.cache.invalidateUser(userId);
    return { success: true };
  }
}
