# Fix (2026-08-17) : les cinq premières sorties (ECR, noms de fonction,
# secret_id) sont lues par infra/deploy-images.sh et infra/push-secrets.sh
# via `terraform output`, pour qu'aucun script ne code en dur un id de
# compte, une région ou un nom de secret - mêmes valeurs que ce que
# Terraform a réellement créé. Les deux URLs de fonction n'ont pas d'usage
# automatisé - elles existent pour qu'un humain puisse les lire après un
# apply sans aller les chercher dans la console AWS.

output "ecr_api_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "ecr_mcp_repository_url" {
  value = aws_ecr_repository.mcp.repository_url
}

output "lambda_api_function_name" {
  value = aws_lambda_function.api.function_name
}

output "lambda_mcp_function_name" {
  value = aws_lambda_function.mcp.function_name
}

output "api_function_url" {
  value = aws_lambda_function_url.api.function_url
}

output "mcp_function_url" {
  value = aws_lambda_function_url.mcp.function_url
}

output "secret_id" {
  value = aws_secretsmanager_secret.app_env.id
}
