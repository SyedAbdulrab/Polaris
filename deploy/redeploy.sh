#!/usr/bin/env bash
#
# Polaris redeploy — pulls latest code for both repos, rebuilds, restarts, verifies.
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

# Where the two repos live. Adjust if your layout differs.
POLARIS_DIR="${POLARIS_DIR:-$HOME/polaris}"
WEB_DIR="${WEB_DIR:-$HOME/polaris-web}"

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
HEALTH_TIMEOUT_SECONDS=60

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
[ -d "$WEB_DIR/.git" ]     || { echo "✗ $WEB_DIR is not a git repo";     exit 1; }
[ -f "$COMPOSE_FILE" ]     || { echo "✗ missing $COMPOSE_FILE"; exit 1; }
[ -f "$ENV_FILE" ]         || { echo "✗ missing $ENV_FILE — production secrets not set up"; exit 1; }

echo "✓ both repos present, compose + env in place"

# ---------- pull ----------

step "Pulling latest code"

(cd "$POLARIS_DIR" && git fetch --quiet && git pull --ff-only)
(cd "$WEB_DIR"     && git fetch --quiet && git pull --ff-only)

# Print the SHAs we're about to deploy so the CI log shows exactly what shipped.
api_sha=$(cd "$POLARIS_DIR" && git rev-parse --short HEAD)
web_sha=$(cd "$WEB_DIR"     && git rev-parse --short HEAD)
echo "  polaris      → $api_sha"
echo "  polaris-web  → $web_sha"

# ---------- build + bring up ----------

step "Building & restarting containers"

cd "$POLARIS_DIR"
require docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

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
    docker compose -f "$COMPOSE_FILE" logs --tail=60 api || true
    exit 1
  fi
  printf '.'
  sleep 2
done

# ---------- cleanup ----------

step "Cleaning up dangling images"

docker image prune -f >/dev/null

step "Deploy complete · api=$api_sha · web=$web_sha"
