import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

// Owns a Prometheus registry plus the custom HTTP metrics. `collectDefaultMetrics`
// adds the standard Node/process gauges (heap, event-loop lag, GC, open FDs, …)
// for free — that covers "saturation" for the app process out of the box.
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  // Counter: monotonically increasing total of HTTP requests, sliced by labels.
  // We `rate()` this in PromQL to get traffic + error rate (golden signals).
  readonly httpRequestsTotal: Counter<string>;

  // Histogram: buckets request durations so PromQL can compute p50/p95/p99.
  readonly httpRequestDuration: Histogram<string>;

  constructor() {
    this.registry.setDefaultLabels({ app: 'polaris-api' });
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      // Buckets tuned for a web API: 5ms … 5s.
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
  }

  // The text-format exposition Prometheus scrapes.
  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
