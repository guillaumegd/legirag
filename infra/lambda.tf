# Item 12d (révisé Lambda) - une fonction par image conteneur (API, MCP),
# invoquée via une Function URL avec réponse en streaming plutôt qu'une API
# Gateway : le trafic attendu (site de démonstration, de l'ordre de
# quelques visites/mois) ne justifie ni son coût fixe ni sa complexité
# supplémentaire. Pas de VPC configuré : Supabase, Bedrock et Cohere sont
# tous des endpoints publics, donc une fonction hors VPC les joint
# directement, sans rien à router en privé.
#
# AWS_LWA_PORT/AWS_LWA_INVOKE_MODE sont lus par le Lambda Web Adapter
# (copié dans l'image par les Dockerfiles, pas géré ici) - il fait le pont
# entre l'API d'invocation Lambda et le serveur HTTP existant (NestJS/MCP),
# qui tourne sans modification. APP_SECRET_ID n'est qu'une référence (ARN),
# jamais une valeur de secret - le vrai contenu est récupéré au démarrage
# par infra/docker/lambda-entrypoint.mjs, qui appelle Secrets Manager
# directement via le SDK AWS (corrigé, F-09 : ce commentaire décrivait
# encore l'extension Parameters and Secrets, abandonnée avant même le
# premier déploiement - jamais placé ici en clair dans les deux cas).

resource "aws_lambda_function" "api" {
  function_name = "legirag-api"
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.api.repository_url}:latest"
  role          = aws_iam_role.api.arn
  timeout       = 30
  memory_size   = 512
  # arm64, pas le x86_64 par défaut : les images sont construites sans
  # --platform sur une machine Apple Silicon, donc arm64 nativement - un
  # décalage avec le x86_64 par défaut a fait planter le Web Adapter au
  # démarrage ("exec format error"), confirmé en conditions réelles
  # (2026-08-17) via `aws lambda invoke` direct. arm64/Graviton est aussi
  # moins cher que x86_64 sur Lambda, sans contrepartie ici.
  architectures = ["arm64"]

  environment {
    variables = {
      AWS_LWA_PORT = "3000"
      # Casse volontairement différente de celle de aws_lambda_function_url
      # ci-dessous : ce sont deux systèmes distincts avec deux conventions
      # différentes - la valeur acceptée par le Web Adapter est en
      # minuscules ("buffered"/"response_stream"), sinon repli silencieux
      # en mode "buffered" (bug F-05, /audit 2026-08-17).
      AWS_LWA_INVOKE_MODE = "response_stream"
      APP_SECRET_ID       = aws_secretsmanager_secret.app_env.arn
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.api_basic_execution,
    aws_iam_role_policy.api_bedrock,
    aws_iam_role_policy.api_secret_read,
  ]

  tags = { Name = "legirag-api" }
}

# authorization_type = NONE : accès public sans IAM SigV4, même posture que
# le design Fargate précédent (IP publique, 0.0.0.0/0). Pas d'authentification
# utilisateur prévue pour v1 (project-overview.md, "Users").
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "NONE"
  invoke_mode        = "RESPONSE_STREAM"
}

# authorization_type = NONE sur la Function URL ne suffit pas à elle seule :
# sans cette permission explicite, la politique basée sur les ressources de
# la fonction refuse tout appel par défaut (403 Forbidden) - confirmé en
# conditions réelles (2026-08-17), la Function URL renvoyait Forbidden
# malgré authorization_type = NONE avant l'ajout de cette ressource.
resource "aws_lambda_permission" "api_function_url_public" {
  statement_id           = "AllowPublicFunctionUrlInvoke"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

# Depuis octobre 2025, une Function URL exige les deux permissions -
# InvokeFunctionUrl (ci-dessus) ET InvokeFunction, cette dernière restreinte
# aux appels passés par la Function URL via invoked_via_function_url - sinon
# 403 Forbidden même avec authorization_type = NONE et la permission
# ci-dessus correctement posée. Manquait entièrement, confirmé en
# conditions réelles (2026-08-17) : la Function URL renvoyait Forbidden
# malgré tout le reste correct, jusqu'à l'ajout de cette ressource.
resource "aws_lambda_permission" "api_function_url_invoke" {
  statement_id             = "AllowPublicFunctionUrlInvokeFunction"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.api.function_name
  principal                = "*"
  invoked_via_function_url = true
}

resource "aws_lambda_function" "mcp" {
  function_name = "legirag-mcp"
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.mcp.repository_url}:latest"
  role          = aws_iam_role.mcp.arn
  timeout       = 30
  memory_size   = 512
  # arm64 : même raisonnement que aws_lambda_function.api ci-dessus.
  architectures = ["arm64"]

  environment {
    variables = {
      AWS_LWA_PORT = "3333"
      # Casse volontairement différente de celle de aws_lambda_function_url
      # ci-dessous : ce sont deux systèmes distincts avec deux conventions
      # différentes - la valeur acceptée par le Web Adapter est en
      # minuscules ("buffered"/"response_stream"), sinon repli silencieux
      # en mode "buffered" (bug F-05, /audit 2026-08-17).
      AWS_LWA_INVOKE_MODE = "response_stream"
      APP_SECRET_ID       = aws_secretsmanager_secret.app_env.arn
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.mcp_basic_execution,
    aws_iam_role_policy.mcp_bedrock,
    aws_iam_role_policy.mcp_secret_read,
  ]

  tags = { Name = "legirag-mcp" }
}

resource "aws_lambda_function_url" "mcp" {
  function_name      = aws_lambda_function.mcp.function_name
  authorization_type = "NONE"
  invoke_mode        = "RESPONSE_STREAM"
}

resource "aws_lambda_permission" "mcp_function_url_public" {
  statement_id           = "AllowPublicFunctionUrlInvoke"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.mcp.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "mcp_function_url_invoke" {
  statement_id             = "AllowPublicFunctionUrlInvokeFunction"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.mcp.function_name
  principal                = "*"
  invoked_via_function_url = true
}
