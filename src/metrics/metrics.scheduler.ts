import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsScheduler {
  private readonly logger = new Logger(MetricsScheduler.name);

  constructor(private readonly metrics: MetricsService) {}

  // Daily at 00:05 UTC. Past midnight to make sure "today" rolls over cleanly across regions.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { timeZone: 'UTC' })
  async dailySnapshot() {
    const written = await this.metrics.takeSnapshotsForAllUsers();
    this.logger.log(`Daily snapshot wrote ${written} rows`);
  }
}
