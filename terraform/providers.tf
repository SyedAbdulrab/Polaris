# Terraform + provider setup.
#
# The `terraform` block pins versions so this config behaves identically on any
# machine (reproducibility — the whole point of IaC). The `provider` block
# configures the AWS plugin: which region to operate in. Credentials are NOT
# here — they're read from the standard chain (env vars / ~/.aws/credentials),
# so secrets never live in the repo.
terraform {
  # use_lockfile (native S3 state locking) needs Terraform >= 1.10.
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state in S3. Backend blocks CANNOT use variables — every value must
  # be a literal. Create the bucket out-of-band first (chicken-and-egg), then
  # run `terraform init -migrate-state` to move local state up here.
  backend "s3" {
    bucket = "REPLACE_WITH_YOUR_STATE_BUCKET" # e.g. polaris-tfstate-1a2b3c4d
    key    = "polaris/terraform.tfstate"      # path of the state object within the bucket
    region = "eu-north-1"
    encrypt      = true                        # encrypt the state object at rest
    use_lockfile = true                        # native S3 locking — no DynamoDB needed
  }
}

provider "aws" {
  region = var.aws_region
}
