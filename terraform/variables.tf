# Input variables. Defaults match the current values exactly, so introducing
# them changes nothing — they just make the config configurable instead of
# riddled with magic strings.

variable "aws_region" {
  description = "AWS region all resources live in."
  type        = string
  default     = "eu-north-1"
}

variable "project" {
  description = "Project name, used for tagging/identification."
  type        = string
  default     = "polaris"
}
