output "api_url" {
  description = "Public HTTPS URL for the Polaris API"
  value       = "https://${azurerm_container_app.api.latest_revision_fqdn}"
}

output "postgres_fqdn" {
  value = azurerm_postgresql_flexible_server.this.fqdn
}

output "redis_hostname" {
  value = azurerm_redis_cache.this.hostname
}

output "resource_group" {
  value = azurerm_resource_group.this.name
}
