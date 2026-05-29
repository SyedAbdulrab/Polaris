import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsService } from './metrics.service';

// Wires up Prometheus metrics: the shared registry plus a global interceptor that
// meters every HTTP request. The /metrics endpoint itself is registered on the raw
// Express instance in main.ts (so it dodges the /api prefix and route collisions).
@Module({
  providers: [
    MetricsService,
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class ObservabilityModule {}
