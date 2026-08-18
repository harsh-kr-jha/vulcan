variable "project_id" {
  description = "Google Cloud project containing the vertical cells."
  type        = string
}

variable "region" {
  description = "Cloud Run and regional serverless NEG region."
  type        = string
  default     = "asia-south1"
}

variable "network" {
  description = "Fully qualified VPC network name used by Direct VPC egress."
  type        = string
}

variable "subnet" {
  description = "Fully qualified regional subnet name used by Direct VPC egress."
  type        = string
}

variable "cloud_sql_instance_name" {
  description = "Existing shared Cloud SQL instance name; each cell receives a separate database."
  type        = string
}

variable "frontend_image" {
  description = "Digest-pinned frontend image shared by all cells."
  type        = string

  validation {
    condition     = strcontains(var.frontend_image, "@sha256:")
    error_message = "frontend_image must be pinned by sha256 digest."
  }
}

variable "backend_image" {
  description = "Digest-pinned backend image shared by all cells and migration jobs."
  type        = string

  validation {
    condition     = strcontains(var.backend_image, "@sha256:")
    error_message = "backend_image must be pinned by sha256 digest."
  }
}

variable "deletion_protection" {
  description = "Protect Cloud Run services and jobs from accidental deletion."
  type        = bool
  default     = true
}

variable "verticals" {
  description = <<-EOT
    Per-vertical deployment cells. Secret maps use environment-variable names as keys and
    Secret Manager secret IDs plus pinned numeric versions as values. Supply a complete
    fail-closed Django environment to both runtime_secrets and migration_secrets; the latter
    should use a database role allowed to run migrations.
  EOT

  type = map(object({
    domain           = string
    database_name    = string
    bucket_name      = string
    min_instances    = optional(number, 0)
    max_instances    = optional(number, 5)
    retention_days   = optional(number)
    extra_backend_env = optional(map(string), {})
    runtime_secrets = map(object({
      secret  = string
      version = string
    }))
    migration_secrets = map(object({
      secret  = string
      version = string
    }))
  }))

  validation {
    condition = alltrue([
      for name, config in var.verticals :
      contains(["automotive", "mushroom"], name)
      && can(regex("^[a-z0-9.-]+$", config.domain))
      && config.min_instances >= 0
      && config.max_instances >= max(1, config.min_instances)
      && (config.retention_days == null ? true : config.retention_days >= 1)
    ])
    error_message = "Only allowlisted variants with valid domains, scaling, and optional positive retention are accepted."
  }
}
