# Item 12d - amorçage de l'état distant. Ce bucket/cette table ne peuvent pas
# eux-mêmes être gérés par le backend S3 qu'ils vont servir (problème de
# l'œuf et de la poule) : le processus réel, jamais exécuté par cette
# fonctionnalité, se fait en deux temps -
#   1. `terraform apply` une première fois avec l'état local par défaut
#      (backend "s3" toujours commenté dans versions.tf à ce stade) - crée
#      ce bucket et cette table.
#   2. Décommenter et renseigner le bloc `backend "s3"` de versions.tf avec
#      le nom réel du bucket, puis `terraform init -migrate-state` pour
#      basculer l'état local vers S3.
# Jamais exécuté ici - voir infra/README.md (étape 4).

resource "aws_s3_bucket" "terraform_state" {
  bucket = "legirag-terraform-state"

  lifecycle {
    prevent_destroy = true
  }

  tags = { Name = "legirag-terraform-state" }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket                  = aws_s3_bucket.terraform_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "terraform_lock" {
  name         = "legirag-terraform-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = { Name = "legirag-terraform-lock" }
}
