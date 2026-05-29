# IAM for the nightly backup job. The EC2 box assumes this role via its instance
# profile (no access keys on disk) to write dumps to S3.
#
# One "role" in the console = four Terraform objects:
#   - aws_iam_role                  the role + trust policy (WHO may assume it)
#   - aws_iam_policy                the permission policy   (WHAT it may do)
#   - aws_iam_role_policy_attachment glue between the two
#   - aws_iam_instance_profile      the EC2-attachable wrapper

# ---------- trust policy (WHO can assume the role) ----------
# A data source that RENDERS to JSON. Terraform validates it at plan time and
# turns it into the policy document string — cleaner + safer than raw JSON.
data "aws_iam_policy_document" "backup_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name        = "polaris-backup-role"
  description = "Allows EC2 instances to call AWS services on your behalf."
  # The rendered trust policy from the data source above.
  assume_role_policy = data.aws_iam_policy_document.backup_assume_role.json
}

# ---------- permission policy (WHAT the role may do) ----------
# Append-only by design: PutObject + ListBucket, but NO GetObject/DeleteObject.
# A compromised box can ADD backups, never read or destroy existing ones.
data "aws_iam_policy_document" "backup_permissions" {
  statement {
    sid       = "WriteBackups"
    effect    = "Allow"
    actions   = ["s3:PutObject"]
    resources = ["arn:aws:s3:::polaris-backups-*/*"]
  }

  statement {
    sid       = "ListBackupBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::polaris-backups-*"]
  }
}

resource "aws_iam_policy" "backup" {
  name   = "polaris-backup-policy"
  policy = data.aws_iam_policy_document.backup_permissions.json
}

# ---------- attach the policy to the role ----------
resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = aws_iam_policy.backup.arn
}

# ---------- instance profile (what EC2 actually attaches) ----------
# Shares the role's name because that's what the console auto-created.
resource "aws_iam_instance_profile" "backup" {
  name = "polaris-backup-role"
  role = aws_iam_role.backup.name
}
