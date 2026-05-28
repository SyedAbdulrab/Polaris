import { Module } from '@nestjs/common';

import { MetricsModule } from '../metrics/metrics.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [MetricsModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
