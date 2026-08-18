output "cells" {
  description = "Per-vertical resources to connect to the shared HTTPS load balancer URL map."
  value = {
    for variant, config in var.verticals : variant => {
      domain             = config.domain
      cloud_run_service  = google_cloud_run_v2_service.cell[variant].name
      backend_service_id = google_compute_backend_service.cell[variant].id
      migration_job      = google_cloud_run_v2_job.migration[variant].name
      database           = google_sql_database.cell[variant].name
      bucket             = google_storage_bucket.source_data[variant].name
      service_account    = google_service_account.web[variant].email
    }
  }
}
