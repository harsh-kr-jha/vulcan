# Tamaso Demo — Cloud Run deployment for internal showcases.
#
# Creates one Cloud Run service per operating template with independent
# service accounts, databases, and IAM-restricted access. Uses the same
# digest-pinned artifacts published for customer deployments.

resource "google_service_account" "demo" {
  for_each = var.templates

  account_id   = "tamaso-demo-${each.key}"
  display_name = "Tamaso demo ${each.key} runtime"
}

resource "google_project_iam_member" "demo_cloud_sql_client" {
  for_each = var.templates

  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.demo[each.key].email}"
}

resource "google_sql_database" "demo" {
  for_each = var.templates

  name            = each.value.database_name
  instance        = var.cloud_sql_instance_name
  deletion_policy = "ABANDON"
}

resource "google_storage_bucket" "demo" {
  for_each = var.templates

  name                        = "${var.project_id}-tamaso-demo-${each.key}"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
}

resource "google_cloud_run_v2_service" "demo" {
  for_each = var.templates

  name                = "tamaso-demo-${each.key}"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  deletion_protection = var.deletion_protection

  template {
    service_account                  = google_service_account.demo[each.key].email
    max_instance_request_concurrency = 40

    scaling {
      min_instance_count = each.value.min_instances
      max_instance_count = each.value.max_instances
    }

    vpc_access {
      network_interfaces {
        network    = var.network
        subnetwork = var.subnet
        tags       = ["tamaso-demo-${each.key}"]
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [var.cloud_sql_connection_name]
      }
    }

    containers {
      name       = "frontend"
      image      = each.value.frontend_image
      depends_on = ["backend"]

      ports {
        name           = "http1"
        container_port = 8080
      }

      env {
        name  = "BACKEND_URL"
        value = "http://localhost:8000"
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 2
        period_seconds        = 2
        failure_threshold     = 30
        tcp_socket {
          port = 8080
        }
      }
    }

    containers {
      name  = "backend"
      image = each.value.backend_image

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      dynamic "env" {
        for_each = merge(
          {
            DJANGO_DEBUG                 = "false"
            DJANGO_ALLOWED_HOSTS         = each.value.domain
            DJANGO_CSRF_TRUSTED_ORIGINS  = "https://${each.value.domain}"
            CORS_ALLOWED_ORIGINS         = ""
            DJANGO_LOG_LEVEL             = "INFO"
          },
          each.value.extra_env,
        )
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = each.value.runtime_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      startup_probe {
        initial_delay_seconds = 0
        timeout_seconds       = 2
        period_seconds        = 3
        failure_threshold     = 40
        http_get {
          path = "/health/"
          port = 8000
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_sql_database.demo,
    google_project_iam_member.demo_cloud_sql_client,
  ]
}

resource "google_storage_bucket_iam_member" "demo_model_artifacts" {
  for_each = var.templates

  bucket = google_storage_bucket.demo[each.key].name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${google_service_account.demo[each.key].email}"
}

# IAM: restrict access to authorized Tamaso team members only
resource "google_cloud_run_v2_service_iam_binding" "demo_invoker" {
  for_each = var.templates

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.demo[each.key].name
  role     = "roles/run.invoker"
  members  = var.authorized_members
}

# Serverless NEG for load balancer host routing
resource "google_compute_region_network_endpoint_group" "demo" {
  for_each = var.templates

  name                  = "tamaso-demo-${each.key}-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.demo[each.key].name
  }
}

resource "google_compute_backend_service" "demo" {
  for_each = var.templates

  name                  = "tamaso-demo-${each.key}-backend"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.demo[each.key].id
  }
}
