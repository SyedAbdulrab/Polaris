output "alb_dns_name" {
  description = "Public DNS for the API"
  value       = aws_lb.this.dns_name
}

output "rds_endpoint" {
  value = aws_db_instance.postgres.address
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "ecs_cluster" {
  value = aws_ecs_cluster.this.name
}
