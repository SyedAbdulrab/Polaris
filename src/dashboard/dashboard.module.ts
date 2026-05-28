import { Module } from '@nestjs/common';

import { AccountModule } from '../account/account.module';
import { MetricsModule } from '../metrics/metrics.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [MetricsModule, AccountModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
