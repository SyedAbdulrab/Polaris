#!/usr/bin/env bash
#
# Polaris Postgres backup → S3.
#
# Strategy: dump → VERIFY → upload (not a blind streaming pipe). A pg_dump that
# dies halfway must NOT produce an object in S3 that looks like a good backup.
# So we dump to a temp file, integrity-check it, and only then upload.
#
# Auth: uses the EC2 instance role (polaris-backup-role) via IMDS — no AWS keys
# on disk. The role allows s3:PutObject only (not Get/Delete), so a compromised
# box can add backups but cannot read or destroy existing ones.
#
# Run manually:   ~/polaris/deploy/backup.sh
# Run from cron:  see deploy/EC2_MANUAL.md / Phase B4
#
set -euo pipefail

# ---------- config ----------

POLARIS_DIR="${POLARIS_DIR:-$HOME/polaris}"
ENV_FILE="${ENV_FILE:-$POLARIS_DIR/.env.prod}"
PG_CONTAINER="${PG_CONTAINER:-polaris-postgres}"

# Smallest plausible good backup. A truncated/empty dump is smaller than this,
# which is how we catch "pg_dump silently produced garbage".
MIN_BYTES="${MIN_BYTES:-500}"

# ---------- helpers ----------

log()  { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die()  { printf '%s  ✗ %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; exit 1; }

# ---------- load db creds + bucket from .env.prod ----------

[ -f "$ENV_FILE" ] || die "missing $ENV_FILE"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${POSTGRES_USER:?POSTGRES_USER not set in $ENV_FILE}"
: "${POSTGRES_DB:?POSTGRES_DB not set in $ENV_FILE}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD not set in $ENV_FILE}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET not set in $ENV_FILE}"

# ---------- preflight ----------

command -v aws >/dev/null      || die "aws CLI not installed on host"
command -v docker >/dev/null   || die "docker not found"
docker inspect "$PG_CONTAINER" >/dev/null 2>&1 \
  || die "container $PG_CONTAINER not running"

# ---------- temp file + guaranteed cleanup ----------

tmp="$(mktemp /tmp/polaris-backup.XXXXXX.sql.gz)"
# Always remove the temp file on exit — success, failure, or Ctrl-C.
trap 'rm -f "$tmp"' EXIT

timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
key="${timestamp}.sql.gz"
dest="s3://${BACKUP_BUCKET}/${key}"

# ---------- dump ----------

log "Dumping ${POSTGRES_DB} from ${PG_CONTAINER}…"
# pg_dump runs INSIDE the container (Postgres has no host port). PGPASSWORD is
# passed via -e so it never appears in the process list on the host.
#   --no-owner       restore doesn't depend on matching role names
#   --clean --if-exists  restore can run over an existing db cleanly
# pipefail makes a pg_dump failure abort the whole pipeline (no partial upload).
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$PG_CONTAINER" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean --if-exists \
  | gzip -9 > "$tmp"

# ---------- verify BEFORE trusting it ----------

log "Verifying dump integrity…"
gzip -t "$tmp" || die "gzip integrity check failed — dump is corrupt, NOT uploading"

size="$(wc -c < "$tmp")"
[ "$size" -ge "$MIN_BYTES" ] \
  || die "dump is only ${size} bytes (< ${MIN_BYTES}) — looks empty/truncated, NOT uploading"
log "Dump OK: ${size} bytes"

# ---------- upload ----------

log "Uploading → ${dest}"
aws s3 cp "$tmp" "$dest" --only-show-errors \
  || die "upload failed"

# ---------- confirm it landed ----------

remote_size="$(aws s3api head-object --bucket "$BACKUP_BUCKET" --key "$key" \
  --query 'ContentLength' --output text 2>/dev/null || echo missing)"
[ "$remote_size" = "$size" ] \
  || die "post-upload size mismatch (local ${size}, remote ${remote_size})"

log "✓ Backup complete: ${key} (${size} bytes) verified in S3"
