# TEMPORARY scaffolding for config-driven import of the security group.
#
# This `import` block tells Terraform: "the resource I'm calling
# aws_security_group.polaris already exists in AWS with the ID below — adopt it."
#
# Workflow:
#   1. Replace sg-REPLACE_ME with your real SG id (from `aws ec2 describe-instances`).
#   2. terraform plan -generate-config-out=sg.tf   → Terraform writes sg.tf for you.
#   3. Review/clean sg.tf together.
#   4. terraform apply                              → performs the state import.
#   5. DELETE this file afterward — import blocks are one-shot, not permanent config.
import {
  to = aws_security_group.polaris
  id = "sg-044e88e29c146d737"
}

# keeping this file as reference for future tf generations
# run this command to generate the tf file:
# terraform plan -generate-config-out=sg.tf