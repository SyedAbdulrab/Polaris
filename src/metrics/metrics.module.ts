import { Module } from '@nestjs/common';

import { MetricsController } from './metrics.controller';
import { MetricsScheduler } from './metrics.scheduler';
import { MetricsService } from './metrics.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsScheduler],
  exports: [MetricsService],
})
export class MetricsModule {}
