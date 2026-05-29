# Terraform + provider setup.
#
# The `terraform` block pins versions so this config behaves identically on any
# machine (reproducibility — the whole point of IaC). The `provider` block
# configures the AWS plugin: which region to operate in. Credentials are NOT
# here — they're read from the standard chain (env vars / ~/.aws/credentials),
# so secrets never live in the repo.
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "eu-north-1"
}
