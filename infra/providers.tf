provider "aws" {
  region = var.aws_region
}

provider "supabase" {
  access_token = var.supabase_access_token
}
