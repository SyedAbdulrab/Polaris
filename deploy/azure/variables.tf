variable "location" {
  type    = string
  default = "eastus"
}

variable "project" {
  type    = string
  default = "polaris"
}

variable "image" {
  description = "Full image reference, e.g. polarisacr.azurecr.io/polaris:latest"
  type        = string
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "min_replicas" {
  type    = number
  default = 1
}

variable "max_replicas" {
  type    = number
  default = 3
}

variable "db_admin" {
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
