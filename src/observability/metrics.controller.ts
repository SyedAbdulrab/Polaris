import { Controller, Get, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';

import { MetricsService } from './metrics.service';

// Exposes GET /metrics in Prometheus text format. Version-neutral + excluded
// from the global `api` prefix (see main.ts) so the path is exactly `/metrics`,
// matching Prometheus' convention. Prometheus scrapes this over the internal
// docker network (api:3000/metrics); nginx blocks it from the public internet.
@ApiExcludeController()
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async scrape(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.contentType());
    res.send(await this.metrics.metrics());
  }
}
