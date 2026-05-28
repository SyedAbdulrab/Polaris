resource "random_id" "suffix" {
  byte_length = 3
}

locals {
  name = "${var.project}-${random_id.suffix.hex}"
}

resource "azurerm_resource_group" "this" {
  name     = "${local.name}-rg"
  location = var.location
}

# ---------- Postgres (Flexible Server) ----------

resource "azurerm_postgresql_flexible_server" "this" {
  name                          = "${local.name}-pg"
  resource_group_name           = azurerm_resource_group.this.name
  location                      = azurerm_resource_group.this.location
  version                       = "16"
  administrator_login           = var.db_admin
  administrator_password        = var.db_password
  sku_name                      = "B_Standard_B1ms"
  storage_mb                    = 32768
  zone                          = "1"
  public_network_access_enabled = true
}

resource "azurerm_postgresql_flexible_server_database" "this" {
  name      = var.project
  server_id = azurerm_postgresql_flexible_server.this.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# Allow Azure-internal services (incl. Container Apps) to reach the DB.
resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  name             = "allow-azure-services"
  server_id        = azurerm_postgresql_flexible_server.this.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# ---------- Redis ----------

resource "azurerm_redis_cache" "this" {
  name                          = "${local.name}-redis"
  resource_group_name           = azurerm_resource_group.this.name
  location                      = azurerm_resource_group.this.location
  capacity                      = 0
  family                        = "C"
  sku_name                      = "Basic"
  non_ssl_port_enabled          = false
  minimum_tls_version           = "1.2"
  public_network_access_enabled = true
}

# ---------- Log Analytics + Container Apps Environment ----------

resource "azurerm_log_analytics_workspace" "this" {
  name                = "${local.name}-logs"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "this" {
  name                       = "${local.name}-env"
  location                   = azurerm_resource_group.this.location
  resource_group_name        = azurerm_resource_group.this.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
}

# ---------- Container App (the API) ----------

resource "azurerm_container_app" "api" {
  name                         = "${local.name}-api"
  container_app_environment_id = azurerm_container_app_environment.this.id
  resource_group_name          = azurerm_resource_group.this.name
  revision_mode                = "Single"

  ingress {
    external_enabled = true
    target_port      = var.container_port
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    container {
      name   = "api"
      image  = var.image
      cpu    = 0.5
      memory = "1Gi"

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "PORT"
        value = tostring(var.container_port)
      }
      env {
        name = "DATABASE_URL"
        value = format(
          "postgresql://%s:%s@%s:5432/%s?schema=public&sslmode=require",
          var.db_admin,
          var.db_password,
          azurerm_postgresql_flexible_server.this.fqdn,
          var.project,
        )
      }
      env {
        name  = "REDIS_URL"
        value = "rediss://:${azurerm_redis_cache.this.primary_access_key}@${azurerm_redis_cache.this.hostname}:${azurerm_redis_cache.this.ssl_port}"
      }
      env {
        name  = "JWT_ACCESS_SECRET"
        value = var.jwt_access_secret
      }
      env {
        name  = "JWT_REFRESH_SECRET"
        value = var.jwt_refresh_secret
      }
      env {
        name  = "JWT_ACCESS_EXPIRES_IN"
        value = "15m"
      }
      env {
        name  = "JWT_REFRESH_EXPIRES_IN"
        value = "7d"
      }
      env {
        name  = "BCRYPT_ROUNDS"
        value = "10"
      }
    }
  }
}
