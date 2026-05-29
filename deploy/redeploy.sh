#!/usr/bin/env bash
#
# Polaris redeploy — pulls latest config + prebuilt GHCR images, restarts, verifies.
#
# Designed to be:
#   - idempotent: running it twice in a row should be a no-op
#   - safe: refuses to proceed if the workspace is in an unexpected state
#   - chatty: prints what it's doing so a CI log is readable
#
# Run manually:
#   ~/polaris/deploy/redeploy.sh
#
# Run from CI:
#   ssh ubuntu@<host> "/home/ubuntu/polaris/deploy/redeploy.sh"

set -euo pipefail

# Serialise concurrent deploys. If polaris and polaris-web both push at the same
# moment, two CI jobs will SSH in simultaneously. flock holds an exclusive lock
# on a sentinel file so only one of them runs the body at a time; the other waits.
LOCKFILE="/tmp/polaris-redeploy.lock"
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  echo "Another redeploy is in progress — waiting for it to finish…"
  flock 9
fi

# ---------- config ----------

# Only the polaris repo is needed on the VM now — it holds the compose file,
# nginx config, and these scripts. The app images (api + web) are prebuilt in
# CI and pulled from GHCR, so polaris-web no longer needs to live here.
POLARIS_DIR="${POLARIS_DIR:-$HOME/polaris}"

# Which compose file orchestrates production.
COMPOSE_FILE="$POLARIS_DIR/docker-compose.prod.yml"
ENV_FILE="$POLARIS_DIR/.env.prod"

# Healthcheck — hit the API through nginx over HTTPS, exercising the full
# real path (TLS termination + host-based routing + proxy → api:3000).
#
# We force the connection to 127.0.0.1 via curl --resolve instead of letting
# DNS send us to the public IP: an EC2 reaching its OWN public IP usually fails
# (NAT loopback / hairpinning isn't supported at the Internet Gateway). Routing
# to 127.0.0.1:443 hits the host-published nginx port, while SNI + Host stay
# api.abdulrab.store so nginx picks the right server block and the cert matches.
HEALTH_HOST="api.abdulrab.store"
HEALTH_URL="https://${HEALTH_HOST}/health"
HEALTH_RESOLVE="${HEALTH_HOST}:443:127.0.0.1"
# Generous because a cold deploy on the t3.micro now boots ~10 containers
# (api, web, postgres, redis, nginx, certbot, prometheus, grafana, node-exporter,
# cadvisor) plus runs migrations — all competing for one vCPU. 60s was too tight.
HEALTH_TIMEOUT_SECONDS=120

# ---------- helpers ----------

# Pretty step header in the log.
step() { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }

# Run a command and abort with a clear message if it fails.
require() {
  if ! "$@"; then
    echo "✗ command failed: $*" >&2
    exit 1
  fi
}

# ---------- preflight ----------

step "Preflight"

[ -d "$POLARIS_DIR/.git" ] || { echo "✗ $POLARIS_DIR is not a git repo"; exit 1; }
[ -f "$COMPOSE_FILE" ]     || { echo "✗ missing $COMPOSE_FILE"; exit 1; }
[ -f "$ENV_FILE" ]         || { echo "✗ missing $ENV_FILE — production secrets not set up"; exit 1; }

echo "✓ repo present, compose + env in place"

# ---------- pull latest config ----------

step "Pulling latest config (compose, nginx, scripts)"

(cd "$POLARIS_DIR" && git fetch --quiet && git pull --ff-only)
config_sha=$(cd "$POLARIS_DIR" && git rev-parse --short HEAD)
echo "  polaris config → $config_sha"

# ---------- pull images + bring up ----------

step "Pulling images from GHCR & restarting containers"

cd "$POLARIS_DIR"
# Pull the app images (api + web) defined in the compose file. Requires a prior
# one-time `docker login ghcr.io` on this box (read:packages token).
require docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull
require docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# ---------- verify ----------

step "Waiting for the API to come up"

deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECONDS ))
while :; do
  if curl --silent --fail --resolve "$HEALTH_RESOLVE" "$HEALTH_URL" >/dev/null; then
    echo "✓ /health responded OK"
    break
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "✗ /health did not respond within ${HEALTH_TIMEOUT_SECONDS}s"
    echo "--- last 60 lines of api logs ---"
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail=60 api || true
    exit 1
  fi
  printf '.'
  sleep 2
done

# ---------- cleanup ----------

step "Cleaning up dangling images"

docker image prune -f >/dev/null

step "Deploy complete · config=$config_sha · images pulled from GHCR"
