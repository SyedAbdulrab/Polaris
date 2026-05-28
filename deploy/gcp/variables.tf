variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "name" {
  type    = string
  default = "polaris"
}

variable "image" {
  description = "Full image, e.g. us-central1-docker.pkg.dev/PROJECT/polaris/api:latest"
  type        = string
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "min_instances" {
  type    = number
  default = 1
}

variable "max_instances" {
  type    = number
  default = 5
}

variable "db_user" {
  type    = string
  default = "polaris"
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "jwt_access_secret" {
  type      = string
  sensitive = true
}

variable "jwt_refresh_secret" {
  type      = string
  sensitive = true
}
