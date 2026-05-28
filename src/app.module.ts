import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AccountModule } from './account/account.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExpenseModule } from './expense/expense.module';
import { ExportModule } from './export/export.module';
import { GoalModule } from './goal/goal.module';
import { HealthModule } from './health/health.module';
import { IncomeModule } from './income/income.module';
import { LogModule } from './log/log.module';
import { MetricsModule } from './metrics/metrics.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { StreakModule } from './streak/streak.module';
import { TransactionModule } from './transaction/transaction.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get('THROTTLE_TTL')) || 60,
          limit: Number(config.get('THROTTLE_LIMIT')) || 120,
        },
      ],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuthModule,
    HealthModule,
    IncomeModule,
    ExpenseModule,
    GoalModule,
    StreakModule,
    LogModule,
    MetricsModule,
    AccountModule,
    TransactionModule,
    DashboardModule,
    ExportModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
