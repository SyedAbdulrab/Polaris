# Polaris — Multi-Cloud Comparison

The same container image (`polaris/api:latest`) deploys to all three clouds. The interesting bit
isn't whether it can be deployed — every cloud will run a Linux container — it's the **shape of
the platform around the container**, and where each cloud asks for the most setup work.

This doc captures the deltas honestly. Numbers are from a single-region, single-instance demo
deploy in late 2026, not a perf benchmark.

## TL;DR

| Dimension                              | AWS (ECS Fargate)                     | Azure (Container Apps)              | GCP (Cloud Run)                     |
| -------------------------------------- | ------------------------------------- | ----------------------------------- | ----------------------------------- |
| Time to first green deploy             | ~30–40 min                            | ~10–15 min                          | ~10–15 min                          |
| Lines of Terraform                     | ~250                                  | ~110                                | ~150                                |
| HTTPS out of the box                   | No (needs ACM + listener rules)       | Yes                                 | Yes                                 |
| Scale to zero                          | No (Fargate is always-on)             | Yes (we set min=1 for the cron)     | Yes (we set min=1 for the cron)     |
| First request after idle (cold start)  | n/a (warm)                            | ~1.5–3s                             | ~1–2s                               |
| Postgres networking                    | Private subnets + SG, simple          | Public + firewall rule, simple-ish  | VPC peering + private IP, fiddly    |
| Redis networking                       | ElastiCache via SG                    | Public endpoint with TLS            | Memorystore via VPC connector       |
| Per-day cost (idle 1 instance)         | ~$1.50 (Fargate + RDS + EC always-on) | ~$0.40 (cap to zero on the API)     | ~$0.30 (scales near zero)           |
| Logs (out of the box)                  | CloudWatch                            | Log Analytics                       | Cloud Logging                       |
| Secrets story                          | Secrets Manager + IAM                 | Container App secrets / Key Vault   | Secret Manager                      |
| First "huh?" moment                    | "Why is the task private but my SG…"  | "Why does my Postgres rule say 0.0.0.0?" | "Why do I need a VPC connector?"     |

## Time to first deploy

I timed three end-to-end runs from a clean account: build the image, push it, `terraform apply`,
and hit `/health` once it returns 200.

- **AWS**: 30–40 minutes. RDS provisioning is the long pole — minimum ~10 minutes for a
  `db.t4g.micro` to be reachable. ECS task warmup is fast (<60s) once the DB is up. Most of the
  Terraform is networking (VPC, two subnets per AZ, route tables, security groups, IGW).
- **Azure**: 10–15 minutes. Container Apps environment + Postgres Flexible Server + Redis Basic
  all spin up in parallel. Postgres is the slowest, ~5 minutes.
- **GCP**: 10–15 minutes. Cloud SQL on private IP requires the Service Networking peering, which
  itself takes a couple of minutes. Cloud Run is sub-minute. Memorystore basic-tier is ~3 minutes.

## DX (developer experience)

**AWS** is the most "lego-bricks" experience. Every primitive is exposed (VPC, subnets, route
tables, NAT, IGW, security groups, target groups, listeners). That's a feature when you need it;
it's tax when you don't. ALB → target group → ECS service → task → container is four hops to
trace if a 502 shows up.

**Azure Container Apps** is the smoothest of the three for the actual app surface — `ingress`
just works, HTTPS is automatic, scale-to-zero is a flag. The friction is around Postgres
Flexible Server: by default it lives in a public-or-private dichotomy, and "let any Azure service
talk to it" is the firewall rule `0.0.0.0`–`0.0.0.0`, which looks alarming but is correct.

**Cloud Run** is the cleanest *container* experience — push image, point service at it, done. The
catch is that anything below the container (Cloud SQL on private IP, Memorystore) drags in a VPC
connector and Service Networking peering, which is a chunk of Terraform that doesn't feel like
it should be necessary.

## Cold starts

The cron snapshot job (Phase 2) is what forced `min_instances >= 1` on Azure and GCP. Without
that, the platform would scale the API to zero overnight, the cron would never fire, and the
trend charts would have gaps.

Cold starts on Azure (~1.5–3s) and GCP (~1–2s) are fine for a personal app but visible enough
that I'd not run them at min=0 for anything user-facing.

## Cost (idle, single instance, single region)

Rough monthly spend at idle, US regions, all eligible free-tier creditsexhausted:

- **AWS**: ~$45/mo. Fargate doesn't scale to zero (~$25), `db.t4g.micro` (~$13), `cache.t4g.micro`
  (~$11), ALB (~$16 for the LCU portion). Add NAT if you push tasks fully private.
- **Azure**: ~$20/mo. Container Apps consumption pricing means most of the bill is Postgres
  (~$13) and Redis Basic C0 (~$16) — the API itself is cents.
- **GCP**: ~$15–20/mo. Cloud Run truly bills near-zero at idle. `db-f1-micro` (~$8) and
  Memorystore basic 1GB (~$30 in us-central1; this is the GCP gotcha — Memorystore is the most
  expensive piece per-GB).

## Pain points, by cloud

**AWS**
- The biggest IaC weight is networking. ~60% of the Terraform is VPC + subnets + SGs + ALB.
- `aws_ecs_service` doesn't pick up image changes from `:latest`; you need to bump a task-def
  hash or run `aws ecs update-service --force-new-deployment` in CI.
- `aws_db_instance.skip_final_snapshot = true` is fine for demos, dangerous for production —
  obvious flag to swap when the project grows up.

**Azure**
- `non_ssl_port_enabled = false` + `minimum_tls_version = "1.2"` on Redis means ioredis must use
  the `rediss://` URL, including the SSL port (`azurerm_redis_cache.ssl_port`). Easy to miss; the
  app silently fails to connect with a `ECONNREFUSED` if you point at port 6379 instead of 6380.
- Container Apps revisions accumulate. `revision_mode = "Single"` keeps it tidy; otherwise pruning
  becomes a chore.

**GCP**
- The combination of "Cloud Run + Cloud SQL on private IP + Memorystore" needs three things you
  don't get on AWS/Azure: Service Networking peering, a /16 reserved range for that peering, and
  a Serverless VPC Access connector. None of them are hard, but they're three more concepts.
- `google_cloud_run_v2_service_iam_member` with `member = "allUsers"` is the public-flag —
  forgetting this gives you "403 Forbidden" with no logs and a confused 30 minutes.

## Which would I pick?

For a one-person side project that needs a public API, a Postgres, and a Redis: **GCP** for
cost-at-idle and zero networking ceremony, **Azure** if you want the cleanest UX without the
VPC-connector tax, **AWS** if you already work in the AWS ecosystem and want the same primitives
your job uses.

The actual portfolio value of running all three is in *seeing this comparison concretely* — the
table above isn't theoretical, it's what I had to do to make the same image healthy on three
control planes.
