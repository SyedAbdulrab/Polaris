# Polaris on AWS

ECS Fargate (the API) + RDS for PostgreSQL + ElastiCache for Redis + ALB.

## Prereqs

- AWS account with admin-equivalent perms
- `terraform >= 1.6`, `aws` CLI v2
- An ECR repository with the `polaris` image pushed

## Build + push the image

```bash
ACCOUNT=123456789012
REGION=us-east-1
REPO=polaris

aws ecr create-repository --repository-name $REPO --region $REGION
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com

# from polaris/ root:
docker build -t $REPO:latest .
docker tag  $REPO:latest $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:latest
docker push                $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:latest
```

## Deploy

```bash
cd deploy/aws
terraform init
terraform apply \
  -var image_uri=$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO:latest \
  -var db_password=$(openssl rand -hex 24) \
  -var jwt_access_secret=$(openssl rand -hex 32) \
  -var jwt_refresh_secret=$(openssl rand -hex 32)
```

When it finishes, `terraform output alb_dns_name` is the API's public URL. Hit `/health` first.

## Notes

- ECS task uses **public subnets with assigned public IP** for a 1-tier demo. In production, push
  the tasks into private subnets behind a NAT — the ALB stays public.
- The Postgres password and JWT secrets are passed via Terraform variables. For a real deployment
  swap these for AWS Secrets Manager and inject via the task definition's `secrets` field.
- Migrations run automatically on boot (the Dockerfile entrypoint does `prisma migrate deploy`).
