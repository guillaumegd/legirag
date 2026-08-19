# Item 12d - mêmes clés que .env.example, à une exception près :
# COHERE_API_KEY en est délibérément absent (fix, 2026-08-18) - grep sur
# tout packages/*/src confirme qu'aucun code aujourd'hui ne le lit (les
# embeddings Cohere passent par Bedrock via MODEL_EMBEDDING, pas par un
# accès Cohere direct ; COHERE_API_KEY ne sert qu'au reranking, jamais
# fusionné - build-plan 6d). Exiger une clé qu'aucun code ne consomme
# aurait été pur risque sans bénéfice, même raisonnement que le retrait du
# provider Supabase. À rajouter le jour où 6d fusionne réellement.
#
# MODEL_EMBEDDING manquait ici jusqu'à ce fix (2026-08-18) - trouvé en
# conditions réelles : SupabaseRetriever.search() (packages/retrieval)
# appelle embedTexts au moment de la requête, pas seulement à
# l'ingestion, donc requireEnv('MODEL_EMBEDDING') aurait fait planter
# toute vraie question posée à l'API déployée. Le secret déjà en place
# sur AWS en était donc dépourvu jusqu'à ce que infra/push-secrets.sh soit
# relancé après ce fix.
#
# Terraform ne gère que l'existence du secret, jamais ses vraies valeurs :
# la version créée ici n'est qu'un gabarit vide, et lifecycle.ignore_changes
# garantit qu'un futur `terraform apply` n'écrase jamais des valeurs
# réelles saisies après coup (infra/push-secrets.sh) - remplir ce secret
# reste une action manuelle du même type que le plafond de facturation AWS
# déjà signalé ailleurs dans ce projet.
#
# Accès en lecture (révisé Lambda, 12d) : contrairement à ECS, qui injecte
# un secret Secrets Manager directement comme variable d'environnement de
# tâche (champ `secrets`), Lambda n'a pas d'équivalent natif. Chaque
# fonction lit ce secret au démarrage via infra/docker/lambda-entrypoint.mjs,
# qui appelle Secrets Manager directement via le SDK AWS (corrigé, F-09 :
# ce commentaire décrivait encore l'extension Parameters and Secrets,
# abandonnée avant même le premier déploiement), pas via Terraform - voir
# infra/lambda.tf (APP_SECRET_ID) et infra/iam.tf (`*_secret_read`,
# `secretsmanager:GetSecretValue`).

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
    MODEL_EMBEDDING           = "REPLACE_ME"
    SUPABASE_URL              = "REPLACE_ME"
    SUPABASE_ANON_KEY         = "REPLACE_ME"
    SUPABASE_SERVICE_ROLE_KEY = "REPLACE_ME"
    DATABASE_URL              = "REPLACE_ME"
    # Fix (2026-08-19) : exigé par packages/api et packages/mcp
    # (verifyAccessToken, @legirag/shared) - même valeur que celle
    # configurée côté serveur Vercel (LEGIRAG_ACCESS_TOKEN).
    LEGIRAG_ACCESS_TOKEN = "REPLACE_ME"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}
