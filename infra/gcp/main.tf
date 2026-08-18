locals {
  backend_env = {
    for variant, config in var.verticals : variant => merge(
      {
        VULCAN_VARIANT                 = variant
        DJANGO_DEBUG                  = "false"
        DJANGO_ALLOWED_HOSTS          = "${config.domain},localhost"
        DJANGO_CSRF_TRUSTED_ORIGINS   = "https://${config.domain}"
        CORS_ALLOWED_ORIGINS          = ""
        CELERY_TASK_ALWAYS_EAGER      = "false"
        AWS_REGION                    = "auto"
        AWS_S3_BUCKET                 = config.bucket_name
        AWS_S3_ENDPOINT_URL           = "https://storage.googleapis.com"
        AWS_S3_PUBLIC_ENDPOINT_URL    = "https://storage.googleapis.com"
        DJANGO_HSTS_INCLUDE_SUBDOMAINS = "false"
        DJANGO_HSTS_PRELOAD            = "false"
        DJANGO_LOG_LEVEL               = "INFO"
      },
      config.extra_backend_env,
    )
  }

  runtime_secret_bindings = merge([
    for variant, config in var.verticals : {
      for environment_name, reference in config.runtime_secrets :
      "${variant}/${environment_name}" => {
        variant = variant
        secret  = reference.secret
      }
    }
  ]...)

  migration_secret_bindings = merge([
    for variant, config in var.verticals : {
      for environment_name, reference in config.migration_secrets :
      "${variant}/${environment_name}" => {
        variant = variant
        secret  = reference.secret
      }
    }
  ]...)
}

resource "google_service_account" "web" {
  for_each = var.verticals

  account_id   = "vulcan-${each.key}-web"
  display_name = "Vulcan ${each.key} web runtime"
}

resource "google_service_account" "migration" {
  for_each = var.verticals

  account_id   = "vulcan-${each.key}-migration"
  display_name = "Vulcan ${each.key} migration job"
}

resource "google_secret_manager_secret_iam_member" "runtime" {
  for_each = local.runtime_secret_bindings

  secret_id = each.value.secret
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.web[each.value.variant].email}"
}

resource "google_secret_manager_secret_iam_member" "migration" {
  for_each = local.migration_secret_bindings

  secret_id = each.value.secret
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migration[each.value.variant].email}"
}

resource "google_storage_bucket" "source_data" {
  for_each = var.verticals

  name                        = each.value.bucket_name
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  dynamic "lifecycle_rule" {
    for_each = each.value.retention_days == null ? [] : [each.value.retention_days]
    content {
      condition {
        age            = lifecycle_rule.value
        matches_prefix = ["raw/"]
      }
      action {
        type = "Delete"
      }
    }
  }
}

resource "google_sql_database" "cell" {
  for_each = var.verticals

  name            = each.value.database_name
  instance        = var.cloud_sql_instance_name
  deletion_policy = "ABANDON"
}

resource "google_cloud_run_v2_service" "cell" {
  for_each = var.verticals

  name                = "vulcan-${each.key}"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  deletion_protection = var.deletion_protection

  template {
    service_account                  = google_service_account.web[each.key].email
    max_instance_request_concurrency = 40

    scaling {
      min_instance_count = each.value.min_instances
      max_instance_count = each.value.max_instances
    }

    vpc_access {
      network_interfaces {
        network    = var.network
        subnetwork = var.subnet
        tags       = ["vulcan-${each.key}"]
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      name       = "frontend"
      image      = var.frontend_image
      depends_on = ["backend"]

      ports {
        name           = "http1"
        container_port = 8080
      }

      env {
        name  = "BACKEND_URL"
        value = "http://localhost:8000"
      }
      env {
        name  = "VULCAN_VARIANT"
        value = each.key
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
      image = var.backend_image

      dynamic "env" {
        for_each = local.backend_env[each.key]
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
    google_secret_manager_secret_iam_member.runtime,
    google_sql_database.cell,
  ]
}

resource "google_cloud_run_v2_job" "migration" {
  for_each = var.verticals

  name                = "vulcan-${each.key}-migration"
  location            = var.region
  deletion_protection = var.deletion_protection

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = google_service_account.migration[each.key].email
      max_retries      = 0
      timeout          = "900s"

      vpc_access {
        network_interfaces {
          network    = var.network
          subnetwork = var.subnet
          tags       = ["vulcan-${each.key}-migration"]
        }
        egress = "PRIVATE_RANGES_ONLY"
      }

      containers {
        name    = "migration"
        image   = var.backend_image
        command = ["/bin/sh"]
        args = [
          "-c",
          "python backend/manage.py check --deploy --fail-level WARNING && python backend/manage.py migrate --noinput && python backend/manage.py migrate --check",
        ]

        dynamic "env" {
          for_each = local.backend_env[each.key]
          content {
            name  = env.key
            value = env.value
          }
        }

        dynamic "env" {
          for_each = each.value.migration_secrets
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
      }
    }
  }

  depends_on = [
    google_secret_manager_secret_iam_member.migration,
    google_sql_database.cell,
  ]
}

resource "google_compute_region_network_endpoint_group" "cell" {
  for_each = var.verticals

  name                  = "vulcan-${each.key}-serverless-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.cell[each.key].name
  }
}

resource "google_compute_backend_service" "cell" {
  for_each = var.verticals

  name                  = "vulcan-${each.key}-backend"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL_MANAGED"

  backend {
    group = google_compute_region_network_endpoint_group.cell[each.key].id
  }
}

resource "google_cloud_run_v2_service_iam_member" "load_balancer_invoker" {
  for_each = var.verticals

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.cell[each.key].name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
