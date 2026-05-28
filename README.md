# Polaris — API

> Your north-star metrics. A personal life-tracker that ingests your finances and personal data,
> computes derived metrics (projected MRR, savings rate, streaks, highs/lows), and surfaces
> everything in one dashboard. Built to be deployed and compared across **AWS, Azure and GCP**.

This is the backend + the Terraform IaC for all three clouds (in [`deploy/`](deploy/)). The
Next.js frontend lives in a separate repo: **polaris-web**.

## Stack

- **Backend**: NestJS + TypeScript
- **Database**: PostgreSQL via Prisma ORM
- **Cache + scheduler**: Redis (ioredis) + `@nestjs/schedule` cron
- **Auth**: JWT — access (15m default) + refresh (7d, hashed in DB, rotated)
- **Containerization**: Docker (multi-stage); `prisma migrate deploy` runs on boot

## Status

| Phase                                | Status |
| ------------------------------------ | ------ |
| 1. Foundation + Auth                 | ✅     |
| 2. Income / Expense / Goal + Metrics | ✅     |
| 3. Streaks + Logs                    | ✅     |
| 4. Dashboard aggregation + Export    | ✅     |
| 5. Multi-cloud deployment            | ✅     |

## Endpoints

All under `/api/v1` unless otherwise noted. `/health` and `/api/docs` are unversioned.

```
POST   /api/v1/auth/register      → { accessToken, refreshToken, user }
POST   /api/v1/auth/login         → { accessToken, refreshToken, user }
POST   /api/v1/auth/refresh       { refreshToken }  → rotated tokens
POST   /api/v1/auth/logout        🔒  → clears stored refresh-token hash
GET    /api/v1/auth/me            🔒

GET    /api/v1/income             🔒  list
POST   /api/v1/income             🔒
GET    /api/v1/income/:id         🔒
PATCH  /api/v1/income/:id         🔒
DELETE /api/v1/income/:id         🔒

GET    /api/v1/expenses           🔒
POST   /api/v1/expenses           🔒
… (same shape) …

GET    /api/v1/goals              🔒  + POST / GET / PATCH / DELETE

GET    /api/v1/streaks            🔒  + CRUD
POST   /api/v1/streaks/:id/log    🔒  consecutive-day aware
POST   /api/v1/streaks/:id/break  🔒

GET    /api/v1/logs?from=&to=&tags=  🔒  + CRUD

GET    /api/v1/metrics            🔒  computed bundle (cached)
GET    /api/v1/metrics/snapshots  🔒  history
POST   /api/v1/metrics/snapshot   🔒  manual trigger

GET    /api/v1/dashboard          🔒  one-call aggregate (cached)

GET    /api/v1/export/json                🔒
GET    /api/v1/export/csv/:type           🔒  type ∈ income|expenses|goals|streaks|logs|snapshots
GET    /api/v1/export/pdf/monthly?year&month  🔒  monthly summary PDF

GET    /health                              terminus + Prisma DB ping
GET    /api/docs                            Swagger UI
```

## Running locally

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis
npx prisma migrate dev --name init
npm run start:dev
```

Then open <http://localhost:3000/api/docs>.

To populate demo data:

```bash
npm run db:seed     # creates demo@polaris.local / demo-password-123
```

## How the metrics work

The trickiest piece is in [`src/common/frequency.ts`](src/common/frequency.ts). Three pure
functions:

- `toMonthly(amount, frequency)` — converts WEEKLY / MONTHLY / ANNUAL to a monthly equivalent;
  ONE_TIME is treated as 0 because it isn't recurring.
- `sumMonthly(items)` — sums the active items' monthly equivalents on a given date.
- `sumOverPeriod(items, months, from)` — projects what items will pay/cost across an N-month
  window. Used for 3/6/12-month projections; one-time items inside the window count once.

Three scenarios are computed every dashboard call:

- **baseline** — straight-line projection of the active items.
- **upside** — commission-type income × 1.5.
- **downside** — commission-type income × 0.

A daily cron (`src/metrics/metrics.scheduler.ts`) writes a `MetricSnapshot` per user so the
trend charts have real time-series data instead of recomputed-from-scratch numbers.

The whole `/dashboard` payload is cached in Redis under
`polaris:user:<userId>:dashboard:payload` for 5 minutes. Any write to income / expense / goal /
streak / log invalidates the user's keyspace via `polaris:user:<userId>:*`.

## Layout

```
polaris/
├── prisma/
│   ├── schema.prisma          full domain model
│   └── seed.ts                demo data
├── src/
│   ├── main.ts                helmet, validation pipe, swagger at /api/docs
│   ├── app.module.ts          wires every module
│   ├── app.controller.ts
│   ├── common/frequency.ts    pure normalization helpers
│   ├── prisma/                global PrismaModule + PrismaService
│   ├── redis/                 ioredis client + JSON cache helpers
│   ├── health/                /health (Terminus + Prisma indicator)
│   ├── auth/                  register/login/refresh/logout/me, two JWT strategies
│   ├── income/                CRUD scoped to user
│   ├── expense/               CRUD scoped to user
│   ├── goal/                  CRUD scoped to user
│   ├── streak/                CRUD + log/break (consecutive-day logic)
│   ├── log/                   CRUD + tag/date filters
│   ├── metrics/               service + controller + daily cron
│   ├── dashboard/             one-call aggregator
│   └── export/                JSON / CSV / monthly PDF
├── Dockerfile                 multi-stage; runs `prisma migrate deploy` on boot
├── docker-compose.yml         postgres + redis + the api
├── .env.example
└── deploy/
    ├── aws/                   Terraform — ECS Fargate + RDS + ElastiCache + ALB
    ├── azure/                 Terraform — Container Apps + Postgres Flexible + Redis
    ├── gcp/                   Terraform — Cloud Run + Cloud SQL + Memorystore
    └── MULTI_CLOUD.md         the comparison doc
```

