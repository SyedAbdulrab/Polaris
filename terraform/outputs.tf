# Outputs surface useful attributes after apply (and via `terraform output`).
# Handy for scripts, docs, or just quickly grabbing the server's address.

output "instance_id" {
  description = "EC2 instance ID."
  value       = aws_instance.polaris.id
}

output "public_ip" {
  description = "Public IPv4 of the Polaris VM."
  value       = aws_instance.polaris.public_ip
}

output "public_dns" {
  description = "Public DNS name of the Polaris VM."
  value       = aws_instance.polaris.public_dns
}

output "backups_bucket" {
  description = "S3 bucket holding nightly Postgres backups."
  value       = aws_s3_bucket.backups.bucket
}

output "security_group_id" {
  description = "Security group guarding the VM."
  value       = aws_security_group.polaris.id
}

output "backup_role_arn" {
  description = "IAM role the VM assumes for S3 backups."
  value       = aws_iam_role.backup.arn
}
