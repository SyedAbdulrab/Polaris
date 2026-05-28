# Polaris — Manual EC2 Deployment

A step-by-step record of how we got Polaris (NestJS API + Next.js portal +
Postgres + Redis) running on a single AWS EC2 instance using Docker Compose,
including every issue we ran into and how it was fixed.

This is the "do it once by hand so you understand every moving part" deploy.
Once you trust it, the same containers ship to ECS / Container Apps / Cloud
Run via the Terraform under `deploy/aws|azure|gcp/`.

---

## Target architecture

```
                ┌────────────────────────── EC2 instance (Ubuntu 24.04) ──────────────────────────┐
                │                                                                                 │
client ─────► :3001 ──► polaris-web   (Next.js)  ──┐                                              │
client ─────► :3000 ──► polaris-api   (NestJS)  ───┼──► polaris-postgres (port 5432, internal)    │
                                                   └──► polaris-redis    (port 6379, internal)    │
                │                                                                                 │
                │   Docker bridge network — postgres + redis are NOT exposed to the host          │
                └─────────────────────────────────────────────────────────────────────────────────┘
```

Four containers on one Docker bridge network. Only the web (`:3001`) and the
API (`:3000`) are exposed to the host / public internet. Postgres and Redis
stay private — only `api` can reach them.

---

## Prerequisites

| | |
|---|---|
| Two GitHub repos | `polaris` (backend + this deploy folder) and `polaris-web` (frontend) |
| EC2 instance | Ubuntu 24.04 LTS, t3.small or larger, public IPv4 |
| Security group inbound | `22` (your IP), `3000` (`0.0.0.0/0`), `3001` (`0.0.0.0/0`) |
| On the VM | Docker Engine + Docker Compose plugin already installed |
| Local | git, an SSH key whose public half is on the VM |

> **Note**: SG rules `0.0.0.0/0` on `:3000` and `:3001` are fine for a demo /
> dev box. For anything real, lock these down or put nginx + Let's Encrypt in
> front of the whole stack on `:443`.

---

## Phase 1 — Connect and clone

```bash
ssh ubuntu@<EC2_PUBLIC_IP>

# Sibling repos under $HOME — docker-compose.prod.yml uses ../polaris-web
cd ~
git clone https://github.com/<you>/polaris.git
git clone https://github.com/<you>/polaris-web.git
cd polaris
```

Layout on the VM:

```
~/
├── polaris/           # backend, infra, this doc
│   ├── docker-compose.prod.yml
│   ├── .env.prod          (you'll create this next, NOT committed)
│   ├── Dockerfile
│   └── deploy/
└── polaris-web/       # frontend
    └── Dockerfile
```

---

## Phase 2 — Configure secrets

`docker-compose.prod.yml` reads its values from `.env.prod`. The example file
shows every variable required:

```bash
cd ~/polaris
cp .env.prod.example .env.prod
nano .env.prod
```

Required values:

| Variable | What goes here |
|---|---|
| `POSTGRES_USER` | anything, e.g. `polaris` |
| `POSTGRES_PASSWORD` | a long random string |
| `POSTGRES_DB` | e.g. `polaris` |
| `JWT_ACCESS_SECRET` | a long random string (`openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET` | a *different* long random string |
| `PUBLIC_API_URL` | `http://<EC2_PUBLIC_IP>:3000` ← the URL the **browser** will call |

> ### About `PUBLIC_API_URL`
>
> Next.js inlines `process.env.NEXT_PUBLIC_*` values into the JS bundle **at
> build time**. That means: change the API IP/port → you must rebuild the web
> image. `docker compose restart web` is not enough. This is intentional —
> the bundle ships to clients' browsers and can't read server env vars.

---

## Phase 3 — Build and run

```bash
cd ~/polaris
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

This:

1. Builds the API image (multi-stage: `deps` → `build` → `runtime`)
2. Builds the web image, baking `NEXT_PUBLIC_API_URL=$PUBLIC_API_URL` into the bundle
3. Starts postgres + redis, waits for healthchecks
4. Starts the API (which runs `prisma migrate deploy` then `node dist/main.js`)
5. Starts the web

Watch logs come up in real time:

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
```

Healthy API output looks like:

```
polaris-api  | No pending migrations to apply.
polaris-api  | [Nest] LOG [NestFactory] Starting Nest application...
polaris-api  | [Nest] LOG [InstanceLoader] AppModule dependencies initialized
polaris-api  | [Nest] LOG [NestApplication] Nest application successfully started
```

---

## Phase 4 — Verify

From your laptop:

```bash
curl http://<EC2_PUBLIC_IP>:3000/health
# → {"status":"ok","info":{"database":{"status":"up"}},...}

open http://<EC2_PUBLIC_IP>:3000/api/docs   # Swagger
open http://<EC2_PUBLIC_IP>:3001            # the portal
```

Smoke-test register → login → create an income source → see it on the dashboard.
That covers the auth path, JWT issuance, Prisma writes, Redis cache, and the
metrics aggregation endpoint in one go.

---

## Operating it day-to-day

```bash
# Pull latest code, rebuild only what changed, redeploy
cd ~/polaris        && git pull
cd ~/polaris-web    && git pull
cd ~/polaris        && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Tail logs across all services
docker compose -f docker-compose.prod.yml logs -f --tail=100

# Open a shell in the API container
docker compose -f docker-compose.prod.yml exec api sh

# Postgres shell
docker compose -f docker-compose.prod.yml exec postgres psql -U polaris polaris

# Redis shell
docker compose -f docker-compose.prod.yml exec redis redis-cli

# Hard reset (drops data — postgres volume stays unless you also rm volumes)
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml down -v   # nukes the DB too
```

---

## Issues we hit, in order

A faithful log of every wrinkle, with the diagnosis and the fix. These will
all bite anyone redoing this from scratch.

### 1. `polaris-web` build failed — `"/app/public": not found`

**Symptom.** Frontend image build failed at the `COPY public ./public` line.

**Cause.** `polaris-web/public/` was an empty directory locally. Git doesn't
track empty directories, so it never made it into the repo, so it didn't exist
on the VM, so the `COPY` had nothing to copy.

**Fix.** Add `RUN mkdir -p public` in the build stage *before* the `COPY .`
so the directory is guaranteed to exist:

```dockerfile
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
RUN mkdir -p public      # ← guard against empty dir not being in git
COPY . .
RUN npm run build
```

**Lesson.** Empty directories don't survive git. Either commit a `.gitkeep`
inside them or have the Dockerfile create them on demand.

---

### 2. API container in a crash loop — `Error: Cannot find module '/app/dist/main.js'`

**Symptom.** Build succeeded. Container started. Then immediately:

```
polaris-api  | No pending migrations to apply.
polaris-api  | Error: Cannot find module '/app/dist/main.js'
polaris-api  |   code: 'MODULE_NOT_FOUND'
polaris-api  | Node.js v22.22.3
```

…over and over because of `restart: unless-stopped`.

**First wrong hypothesis.** Stale Docker layer cache. We rebuilt with
`docker compose build --no-cache api`. Build ran fully (no `CACHED` lines
on `npm run build` etc). Same crash. So it wasn't cache.

**Real cause — and this one is sneaky.** TypeScript's compiler infers `rootDir`
from the *common ancestor* of all source files it compiles. Polaris has:

```
polaris/
├── src/main.ts            ← intended source
├── prisma/seed.ts         ← also a .ts file
└── tsconfig.build.json    ← didn't exclude prisma/
```

Because `prisma/seed.ts` was *not* excluded from the build, TypeScript's
inferred root was `/app` (the common ancestor of `src/` and `prisma/`), not
`/app/src`. With `outDir: ./dist`, the compiler preserved the structure
relative to that root and emitted:

```
/app/dist/src/main.js          ← actual location
/app/dist/src/auth/...
/app/dist/prisma/seed.js
```

Our `CMD` was `node dist/main.js`, looking at `/app/dist/main.js`, which
didn't exist. Hence `MODULE_NOT_FOUND`. Node was right — the file genuinely
wasn't there. It was one directory deeper.

This is the kind of bug where the build "succeeds" so you stop suspecting it.
The output structure is wrong, but every command exited 0.

**Why it didn't fire locally.** `npm run start:dev` uses ts-node, which doesn't
emit anywhere — it executes from source. The production layout had simply
never been exercised on a fresh build before.

**Fix.** Tell `tsconfig.build.json` to ignore `prisma/`. The seed script is
meant to be run via `npm run db:seed` (which calls ts-node), not compiled.

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "prisma", "**/*spec.ts"]
}
```

After this, `nest build` emits cleanly to `dist/main.js`, the runtime stage
copies it across, `node dist/main.js` finds it, NestJS boots.

**The diagnostic that would have skipped 30 minutes of guessing** — when you
think a multi-stage build is producing the wrong output, build just the
`build` stage and inspect it without involving the runtime stage:

```bash
docker build --target build -t polaris-debug -f Dockerfile .
docker run --rm polaris-debug ls -la /app/dist /app/dist/src 2>&1
```

That would have shown `dist/src/main.js` immediately.

**Lesson.** If multi-root TypeScript projects emit weirdly-nested output,
suspect inferred `rootDir`. Either explicitly set `"rootDir": "./src"` in
`tsconfig.build.json` or exclude every non-`src/` `.ts` file from the build.

---

### 3. Build cache + restart-policy made it look like nothing changed

**Symptom.** `docker compose up -d --build` would build fast and the API
would still crash with the same error. We were sure we were rebuilding.

**Cause.** Two things layered on top of each other:

1. **Layer cache.** When a `RUN npm run build` step's inputs hash to
   something Docker has seen, it reuses the previous layer. So the
   *defective* `dist/src/main.js` layout from the first build kept getting
   pulled forward.
2. **`restart: unless-stopped`.** Each crash was retried in milliseconds, so
   the logs scrolled past quickly and gave the impression that *something*
   was happening.

**Fix.** `docker compose build --no-cache api` to force fresh build steps,
*then* `docker compose up -d`.

**Lesson.** When a fix doesn't seem to land, prove the build is actually
running fresh. Watch for `CACHED` markers in buildkit output. If they appear
on a step you expected to re-run, you didn't invalidate it.

---

### 4. `git pull` complained about "unrelated histories"

**Symptom.** When merging the local `feat/polaris-init` branch into a
newly-created GitHub `main` branch, git refused with
*"refusing to merge unrelated histories"*.

**Cause.** GitHub's auto-generated initial commit (when you tick "Add a
README" while creating the repo) starts a fresh history with no shared
ancestor with the local history.

**Fix used here.** Hard-reset `main` to `feat/polaris-init` and force-push,
discarding GitHub's auto-commit:

```bash
git checkout main
git reset --hard feat/polaris-init
git push --force-with-lease origin main
```

**Lesson.** When creating a new GitHub repo for code that already has local
commits, *don't* tick "Initialize with a README". Create the repo empty,
then `git push -u origin main` from the local clone.

---

## Why this layout, and what's still TODO

This setup is intentionally minimal. Things it does **not** do, and where
they'd plug in:

| Missing | Why it's fine for now | Where it goes |
|---|---|---|
| TLS / HTTPS | Local-dev-on-cloud equivalent | Caddy or nginx + Let's Encrypt in front, or AWS ALB |
| Static IP | EC2 IP only changes on stop/start | Allocate an Elastic IP and associate it |
| Real domain | We're using raw IP | Route53 / Cloudflare A-record to the EIP |
| DB backups | Single-node Postgres in a Docker volume | `pg_dump` cron + S3, or migrate to RDS |
| Centralised logs | `docker compose logs` is fine for one box | CloudWatch Logs, or `loki+promtail`, or `datadog-agent` |
| Auto-deploy on push | We pull + rebuild by hand | GitHub Actions: SSH → `git pull && compose up -d --build` |
| Metrics / alerts | None | CloudWatch + alarms, or Grafana Cloud |
| Multi-AZ / HA | Single VM = single point of failure | Move to ECS / Container Apps / Cloud Run via the Terraform under `deploy/` |

The Terraform under `deploy/aws|azure|gcp/` ships the same images
(`polaris-api`, `polaris-web`) into a managed runtime with managed Postgres
(RDS / Azure DB / Cloud SQL) and managed Redis (ElastiCache / Azure Cache /
Memorystore), with a load balancer and TLS terminated for you. That's the
"real" deploy. This doc is the dev box you operate while you're learning
how the whole stack fits together.

---

## Reference: the running config

### `docker-compose.prod.yml` topology

| Service | Image | Ports exposed to host | Reachable as |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | none | `postgres:5432` (from `api` only) |
| `redis` | `redis:7-alpine` | none | `redis:6379` (from `api` only) |
| `api` | locally-built `polaris-api` | `3000:3000` | `http://<host>:3000` |
| `web` | locally-built `polaris-web` | `3001:3001` | `http://<host>:3001` |

### Health endpoints to check

| URL | What it proves |
|---|---|
| `GET /health` (API) | API process up + Postgres reachable |
| `GET /api/docs` (API) | Swagger generated, app fully bootstrapped |
| `GET /` (web) | Next.js server is serving the bundle |
| Login → dashboard | Full path: web → API → Postgres → Redis → response |

