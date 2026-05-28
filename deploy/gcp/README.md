# Polaris on GCP

Cloud Run (the API) + Cloud SQL for PostgreSQL + Memorystore for Redis, all wired through a
private VPC with a Serverless VPC Access connector.

## Prereqs

- A GCP project (`PROJECT_ID`) with billing enabled
- `terraform >= 1.6`, `gcloud` CLI
- An Artifact Registry repo with the image pushed

## Build + push the image

```bash
PROJECT=your-gcp-project
REGION=us-central1
REPO=polaris

gcloud config set project $PROJECT
gcloud auth configure-docker $REGION-docker.pkg.dev

gcloud artifacts repositories create $REPO --repository-format=docker --location=$REGION

# from polaris/ root:
docker build -t $REGION-docker.pkg.dev/$PROJECT/$REPO/api:latest .
docker push    $REGION-docker.pkg.dev/$PROJECT/$REPO/api:latest
```

## Deploy

```bash
cd deploy/gcp
terraform init
terraform apply \
  -var project_id=$PROJECT \
  -var image=$REGION-docker.pkg.dev/$PROJECT/$REPO/api:latest \
  -var db_password=$(openssl rand -hex 24) \
  -var jwt_access_secret=$(openssl rand -hex 32) \
  -var jwt_refresh_secret=$(openssl rand -hex 32)
```

`terraform output api_url` is the Cloud Run HTTPS URL. HTTPS is automatic.

## Notes

- Cloud SQL is configured with a **private IP only** + a Service Networking peering. That's the
  modern recommendation; it dodges Cloud SQL Proxy entirely.
- Cloud Run reaches both Postgres and Redis via the Serverless VPC Access connector — `egress =
  "PRIVATE_RANGES_ONLY"` keeps public traffic going out the normal egress path.
- For prod, replace the `allUsers` invoker binding with an authenticated identity, and put the
  service behind a Load Balancer or Cloud Armor for IP-level controls.
