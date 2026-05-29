import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';

import { MetricsService } from './metrics.service';

// Records one timing + one count for every HTTP request, labelled by method,
// matched route template, and final status code. We hook the response 'finish'
// event (not the rxjs stream) so the status code is final even when an exception
// filter rewrote it — and so we measure the full response, not just the handler.
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const stopTimer = this.metrics.httpRequestDuration.startTimer();

    res.once('finish', () => {
      // Use the ROUTE TEMPLATE (e.g. "/income/:id"), never the raw URL — that
      // keeps label cardinality bounded instead of exploding per unique id.
      const route = req.route?.path ?? 'unknown';
      const labels = {
        method: req.method,
        route,
        status: String(res.statusCode),
      };
      stopTimer(labels);
      this.metrics.httpRequestsTotal.inc(labels);
    });

    return next.handle();
  }
}
