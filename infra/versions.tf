terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.0"
    }
  }

  # Backend d'état distant — à compléter une fois le bucket S3 créé (J12).
  backend "s3" {
    # bucket = "legirag-terraform-state"
    # key    = "legirag/terraform.tfstate"
    # region = "eu-west-3"
  }
}
