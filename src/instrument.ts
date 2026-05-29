// Sentry initialization. This MUST be imported before any other module in the
// app (it's the first import in main.ts) so Sentry can monkey-patch the HTTP,
// Express and Postgres libraries before they're loaded — that's how it auto-
// traces requests and DB queries.
//
// The DSN comes from the environment (SENTRY_DSN). In production it's injected
// by docker-compose; locally it's usually unset, in which case Sentry.init is a
// no-op and nothing is sent — so local dev errors never pollute the dashboard.
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Tag every event with the environment so prod errors don't mix with anything
  // else. Shows up as a filter in the Sentry UI.
  environment: process.env.NODE_ENV ?? 'development',

  // Performance tracing is high-volume, so we sample a fraction. Errors are
  // ALWAYS captured regardless of this — this only governs perf traces.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),

  // Attach request data (headers, IP) to events. Useful for debugging; off by
  // default to stay conservative with PII. Flip on if you want richer context.
  sendDefaultPii: false,
});
