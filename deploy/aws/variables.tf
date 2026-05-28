variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Resource name prefix"
  type        = string
  default     = "polaris"
}

variable "image_uri" {
  description = "Full ECR image URI for the API, e.g. 123456789012.dkr.ecr.us-east-1.amazonaws.com/polaris:latest"
  type        = string
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "task_cpu" {
  type    = number
  default = 512
}

variable "task_memory" {
  type    = number
  default = 1024
}

variable "db_username" {
  type    = string
  default = "polaris"
}

variable "db_password" {
  description = "Postgres master password"
  type        = string
  sensitive   = true
}

variable "jwt_access_secret" {
  type      = string
  sensitive = true
}

variable "jwt_refresh_secret" {
  type      = string
  sensitive = true
}
