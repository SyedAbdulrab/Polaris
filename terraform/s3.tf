# The S3 bucket that deploy/backup.sh ships nightly Postgres dumps to.
#
# This is a MINIMAL description on purpose. The real bucket also has versioning,
# public-access blocking, and a lifecycle rule — but in the AWS provider those
# are SEPARATE resources (aws_s3_bucket_versioning, etc.). We'll add them once
# the bare bucket is imported and `plan` is clean. Start small, grow the config.
resource "aws_s3_bucket" "backups" {
  bucket = "polaris-backups-2d550477"
}

# Versioning: keeps old versions of an object instead of overwriting in place.
# State showed versioning.enabled = true, which maps to status = "Enabled".
resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Block Public Access: the four switches that make it impossible to ever make
# this bucket (or its objects) public — defense in depth for financial backups.
resource "aws_s3_bucket_public_access_block" "backups" {
  bucket = aws_s3_bucket.backups.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle: auto-expire backups after 30 days so the bucket doesn't grow
# forever. Values match the "expire-old-backups" rule seen in state.
resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "expire-old-backups"
    status = "Enabled"

    # Empty filter = apply to every object in the bucket.
    filter {}

    expiration {
      days = 30
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}
