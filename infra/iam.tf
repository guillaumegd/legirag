# Item 12d (révisé Lambda) - un rôle d'exécution Lambda par fonction. Plus
# simple que la séparation exécution/tâche d'ECS : cette dernière existait
# pour isoler les permissions de la plateforme ECS elle-même (pull d'image,
# logs) de celles de l'application - Lambda n'a qu'un seul rôle par fonction,
# qui porte les deux à la fois (AWS gère le pull de l'image conteneur sans
# permission IAM dédiée côté rôle d'exécution).
# Un rôle séparé par service malgré des policies identiques aujourd'hui :
# le serveur MCP appelle Bedrock directement via son outil router_question
# (confirmé dans packages/mcp/src/server.ts), donc les deux ont besoin de
# bedrock:InvokeModel - mais des rôles séparés restent le choix par défaut
# le plus sain pour un futur écart de permissions.

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "app_env_secret_read" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app_env.arn]
  }
}

# arn:...foundation-model/* plutôt qu'un id de modèle précis : MODEL_VOLUME/
# MODEL_ESCALADE sont des variables d'environnement (coding-standards.md,
# "jamais un id de modèle en dur"), donc le modèle réel n'est pas connu de
# Terraform - le rôle doit rester utilisable quel que soit le modèle choisi
# à l'exécution, dans la même région.
data "aws_iam_policy_document" "bedrock_invoke" {
  statement {
    actions   = ["bedrock:InvokeModel"]
    resources = ["arn:aws:bedrock:${var.aws_region}::foundation-model/*"]
  }
}

resource "aws_iam_role" "api" {
  name               = "legirag-api-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "api_basic_execution" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "api_bedrock" {
  name   = "legirag-api-bedrock"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.bedrock_invoke.json
}

resource "aws_iam_role_policy" "api_secret_read" {
  name   = "legirag-api-secret-read"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.app_env_secret_read.json
}

resource "aws_iam_role" "mcp" {
  name               = "legirag-mcp-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "mcp_basic_execution" {
  role       = aws_iam_role.mcp.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "mcp_bedrock" {
  name   = "legirag-mcp-bedrock"
  role   = aws_iam_role.mcp.id
  policy = data.aws_iam_policy_document.bedrock_invoke.json
}

resource "aws_iam_role_policy" "mcp_secret_read" {
  name   = "legirag-mcp-secret-read"
  role   = aws_iam_role.mcp.id
  policy = data.aws_iam_policy_document.app_env_secret_read.json
}
