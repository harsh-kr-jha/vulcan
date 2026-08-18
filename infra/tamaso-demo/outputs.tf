output "service_urls" {
  description = "Cloud Run service URLs keyed by template name."
  value = {
    for name, service in google_cloud_run_v2_service.demo :
    name => service.uri
  }
}

output "service_accounts" {
  description = "Service account emails keyed by template name."
  value = {
    for name, sa in google_service_account.demo :
    name => sa.email
  }
}

output "backend_services" {
  description = "Load balancer backend service IDs for host-rule attachment."
  value = {
    for name, bs in google_compute_backend_service.demo :
    name => bs.id
  }
}
