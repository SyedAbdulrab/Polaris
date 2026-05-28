# Polaris on Azure

Azure Container Apps (the API) + Azure Database for PostgreSQL Flexible Server + Azure Cache for Redis.

## Prereqs

- Azure subscription, `terraform >= 1.6`, `az` CLI
- An Azure Container Registry (ACR) with the image pushed (or just use Docker Hub / ghcr)

## Build + push the image

```bash
RG=polaris-rg
ACR=polarisacr$RANDOM
LOC=eastus

az group create -n $RG -l $LOC
az acr create -n $ACR -g $RG --sku Basic --admin-enabled true
az acr login -n $ACR

# from polaris/ root:
docker build -t $ACR.azurecr.io/polaris:latest .
docker push    $ACR.azurecr.io/polaris:latest
```

## Deploy

```bash
cd deploy/azure
terraform init
terraform apply \
  -var image=$ACR.azurecr.io/polaris:latest \
  -var db_password=$(openssl rand -hex 24) \
  -var jwt_access_secret=$(openssl rand -hex 32) \
  -var jwt_refresh_secret=$(openssl rand -hex 32)
```

`terraform output api_url` gives you the HTTPS URL. Container Apps gives you HTTPS for free —
no manual cert work.

## Notes

- For private registries, attach a `registry { ... identity = "system" }` block to the container
  app or grant the system-assigned identity `AcrPull` on the registry. Public images (Docker Hub,
  ghcr public) work without extra config.
- `public_network_access_enabled = true` on Postgres + the `0.0.0.0` firewall rule together open
  the DB to "Azure services". Tighten with VNET integration for production.
- Container Apps scale to zero by default (`min_replicas = 0`). We set `min_replicas = 1` so
  the cron snapshot job can fire.
