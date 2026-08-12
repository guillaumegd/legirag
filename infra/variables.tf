variable "aws_region" {
  description = "Région AWS pour Bedrock et les ressources associées"
  type        = string
  default     = "eu-west-3"
}

variable "supabase_access_token" {
  description = "Jeton d'accès à l'API de management Supabase (TF_VAR_supabase_access_token)"
  type        = string
  sensitive   = true
}

variable "supabase_project_ref" {
  description = "Référence du projet Supabase existant"
  type        = string
}
