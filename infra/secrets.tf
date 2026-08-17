# Item 12d - un secret partagé, mêmes clés que .env.example. Terraform ne
# gère que l'existence du secret, jamais ses vraies valeurs : la version
# créée ici n'est qu'un gabarit vide, et lifecycle.ignore_changes garantit
# qu'un futur `terraform apply` n'écrase jamais des valeurs réelles saisies
# manuellement (console/CLI) après coup - remplir ce secret reste une action
# manuelle du même type que le plafond de facturation AWS déjà signalé
# ailleurs dans ce projet.
#
# Accès en lecture (révisé Lambda, 12d) : contrairement à ECS, qui injecte
# un secret Secrets Manager directement comme variable d'environnement de
# tâche (champ `secrets`), Lambda n'a pas d'équivalent natif. Chaque
# fonction lit ce secret au démarrage via l'extension AWS Parameters and
# Secrets (copiée dans l'image par les Dockerfiles), pas via Terraform -
# voir infra/lambda.tf (APP_SECRET_ID) et infra/iam.tf
# (`*_secret_read`, `secretsmanager:GetSecretValue`).

resource "aws_secretsmanager_secret" "app_env" {
  name        = "legirag/app-env"
  description = "Variables d'environnement partagées par les conteneurs API et MCP (mêmes clés que .env.example)"

  tags = { Name = "legirag-app-env" }
}

resource "aws_secretsmanager_secret_version" "app_env" {
  secret_id = aws_secretsmanager_secret.app_env.id
  secret_string = jsonencode({
    AWS_ACCESS_KEY_ID         = "REPLACE_ME"
    AWS_SECRET_ACCESS_KEY     = "REPLACE_ME"
    AWS_REGION                = var.aws_region
    MODEL_VOLUME              = "REPLACE_ME"
    MODEL_ESCALADE            = "REPLACE_ME"
    SUPABASE_URL              = "REPLACE_ME"
    SUPABASE_ANON_KEY         = "REPLACE_ME"
    SUPABASE_SERVICE_ROLE_KEY = "REPLACE_ME"
    DATABASE_URL              = "REPLACE_ME"
    COHERE_API_KEY            = "REPLACE_ME"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
