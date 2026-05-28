# ---------- APIs ----------

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "vpcaccess.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

# ---------- VPC + private services for Cloud SQL / Memorystore ----------

resource "google_compute_network" "this" {
  name                    = "${var.name}-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "this" {
  name          = "${var.name}-subnet"
  network       = google_compute_network.this.id
  ip_cidr_range = "10.30.0.0/24"
  region        = var.region
}

resource "google_compute_global_address" "private_services" {
  name          = "${var.name}-priv-svc"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.this.id
}

resource "google_service_networking_connection" "this" {
  network                 = google_compute_network.this.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}

# ---------- VPC Access connector (so Cloud Run can reach the VPC) ----------

resource "google_vpc_access_connector" "this" {
  name          = "${var.name}-vpcconn"
  region        = var.region
  network       = google_compute_network.this.name
  ip_cidr_range = "10.30.10.0/28"
  depends_on    = [google_project_service.apis]
}

# ---------- Cloud SQL (Postgres) ----------

resource "google_sql_database_instance" "postgres" {
  name             = "${var.name}-pg"
  database_version = "POSTGRES_16"
  region           = var.region
  deletion_protection = false

  settings {
    tier              = "db-f1-micro"
    availability_type = "ZONAL"
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.this.id
    }
  }

  depends_on = [google_service_networking_connection.this]
}

resource "google_sql_database" "this" {
  name     = var.name
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "this" {
  name     = var.db_user
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

# ---------- Memorystore (Redis) ----------

resource "google_redis_instance" "this" {
  name               = "${var.name}-redis"
  tier               = "BASIC"
  memory_size_gb     = 1
  region             = var.region
  authorized_network = google_compute_network.this.id
  redis_version      = "REDIS_7_0"
  depends_on         = [google_project_service.apis]
}

# ---------- Cloud Run ----------

resource "google_cloud_run_v2_service" "api" {
  name     = "${var.name}-api"
  location = var.region

  template {
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      connector = google_vpc_access_connector.this.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.image
      ports { container_port = var.container_port }

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
          "postgresql://%s:%s@%s:5432/%s?schema=public",
          var.db_user,
          var.db_password,
          google_sql_database_instance.postgres.private_ip_address,
          var.name,
        )
      }
      env {
        name  = "REDIS_URL"
        value = "redis://${google_redis_instance.this.host}:${google_redis_instance.this.port}"
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

      startup_probe {
        http_get { path = "/health" }
        initial_delay_seconds = 5
        period_seconds        = 10
        timeout_seconds       = 5
        failure_threshold     = 6
      }
    }
  }

  depends_on = [
    google_redis_instance.this,
    google_sql_database.this,
    google_sql_user.this,
  ]
}

# Make the service publicly invokable.
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
