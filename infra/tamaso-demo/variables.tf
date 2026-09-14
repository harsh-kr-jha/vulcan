variable "project_id" {
  description = "GCP project for the Tamaso demo environment."
  type        = string
}

variable "region" {
  description = "Cloud Run and regional resource region."
  type        = string
  default     = "us-central1"
}

variable "network" {
  description = "Fully qualified VPC network name for Direct VPC egress."
  type        = string
}

variable "subnet" {
  description = "Fully qualified regional subnet name for Direct VPC egress."
  type        = string
}

variable "cloud_sql_instance_name" {
  description = "Existing shared Cloud SQL instance; each template receives a separate database."
  type        = string
}

variable "cloud_sql_connection_name" {
  description = "Cloud SQL connection name in project:region:instance form."
  type        = string
}

variable "deletion_protection" {
  description = "Protect Cloud Run services and jobs from accidental deletion."
  type        = bool
  default     = true
}

variable "authorized_members" {
  description = "IAM members allowed to invoke demo services (e.g. user:name@tamaso.dev)."
  type        = list(string)
}

variable "templates" {
  description = <<-EOT
    Operating templates to deploy as demo services. Each entry creates an
    independent Cloud Run service, service account, database, and storage bucket.
    Images must be digest-pinned.
  EOT

  type = map(object({
    backend_image  = string
    frontend_image = string
    domain         = string
    database_name  = string
    variant_id     = string
    min_instances  = optional(number, 0)
    max_instances  = optional(number, 5)
    extra_env      = optional(map(string), {})
    runtime_secrets = optional(map(object({
      secret  = string
      version = string
    })), {})
  }))

  validation {
    condition = alltrue([
      for name, config in var.templates :
      can(regex("^[a-z0-9-]+$", name))
      && strcontains(config.backend_image, "@sha256:")
      && strcontains(config.frontend_image, "@sha256:")
    ])
    error_message = "Template names must be lowercase-dashes; images must be digest-pinned with @sha256:."
  }
}
