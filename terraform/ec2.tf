# The Polaris EC2 instance — the single VM running the whole stack (postgres,
# redis, api, web, nginx, certbot via docker compose).
#
# Imported from the console-created instance i-066d000aac1e4491a. Immutable
# attributes (ami, instance_type, subnet_id, key_name, availability_zone) are
resource "aws_instance" "polaris" {
  ami               = "ami-05d62b9bc5a6ca605"
  instance_type     = "t3.micro"
  availability_zone = "eu-north-1a"
  subnet_id         = "subnet-0d430b8edc6dd22c9"
  key_name          = "EUN-TEST1-RSA"
  private_ip        = "172.31.27.118"

  associate_public_ip_address = true
  ebs_optimized               = true
  source_dest_check           = true

  # Reference the resources we manage in this same config (creates dependencies,
  # avoids hardcoded-string drift).
  iam_instance_profile   = aws_iam_instance_profile.backup.name
  vpc_security_group_ids = [aws_security_group.polaris.id]

  # IMDSv2 required (http_tokens = required) — token-based metadata, the secure
  # default that protects the instance role credentials from SSRF.
  metadata_options {
    http_endpoint               = "enabled"
    http_protocol_ipv6          = "disabled"
    http_put_response_hop_limit = 2
    http_tokens                 = "required"
    instance_metadata_tags      = "disabled"
  }

  credit_specification {
    cpu_credits = "unlimited"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 16
    iops                  = 3000
    throughput            = 125
    encrypted             = false
    delete_on_termination = true
  }

  tags = {
    Name = "EUN-TEST1"
  }
}
