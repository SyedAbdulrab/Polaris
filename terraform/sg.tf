# Security group protecting the Polaris EC2 instance.
# Imported from the console-created "EUN-TEST1-SG" (an AWS launch-wizard default).
#
# NOTE: this matches CURRENT reality exactly (so the import is a 0-change apply).
# The 3000/3001 ingress rules are stale — after nginx+TLS the containers use
# `expose` not host `ports`, so nothing listens there. We remove them in a
# follow-up apply as a deliberate, reviewable security tightening.
resource "aws_security_group" "polaris" {
  name        = "EUN-TEST1-SG"
  description = "launch-wizard-1 created 2026-05-26T10:42:36.124Z"
  vpc_id      = "vpc-0306d185ddb73f289"

  ingress = [
    # SSH — open to the world so GitHub Actions runners can deploy.
    {
      description      = ""
      from_port        = 22
      to_port          = 22
      protocol         = "tcp"
      cidr_blocks      = ["0.0.0.0/0"]
      ipv6_cidr_blocks = []
      prefix_list_ids  = []
      security_groups  = []
      self             = false
    },
    # HTTPS — nginx TLS terminator.
    {
      description      = ""
      from_port        = 443
      to_port          = 443
      protocol         = "tcp"
      cidr_blocks      = ["0.0.0.0/0"]
      ipv6_cidr_blocks = []
      prefix_list_ids  = []
      security_groups  = []
      self             = false
    },
    # HTTP — nginx (redirects to HTTPS + ACME challenge).
    {
      description      = ""
      from_port        = 80
      to_port          = 80
      protocol         = "tcp"
      cidr_blocks      = ["0.0.0.0/0"]
      ipv6_cidr_blocks = []
      prefix_list_ids  = []
      security_groups  = []
      self             = false
    },
  ]

  egress = [
    # Allow all outbound (protocol "-1" = every protocol/port).
    {
      description      = ""
      from_port        = 0
      to_port          = 0
      protocol         = "-1"
      cidr_blocks      = ["0.0.0.0/0"]
      ipv6_cidr_blocks = []
      prefix_list_ids  = []
      security_groups  = []
      self             = false
    },
  ]

  tags = {}
}
