#!/usr/bin/env bash
# Fix (2026-08-17) : construit et pousse les deux images (API, MCP) vers
# ECR, puis redéploie les fonctions Lambda existantes. Remplace la
# séquence auparavant tapée à la main (finding archivé 12d/F-06 -
# terraform apply seul ne détecte jamais qu'une nouvelle image a été
# poussée sur le tag mutable :latest). Lit ses cibles via
# `terraform output` plutôt que de coder en dur un id de compte ou une
# région. Ne lance jamais terraform apply/plan : suppose que l'infra
# existe déjà - voir infra/README.md pour le tout premier déploiement,
# qui suit un ordre différent (apply échoue sur les Lambda tant qu'aucune
# image n'existe, donc apply -> ce script -> apply).
set -euo pipefail

# Profil "terraform" (~/.aws/config) plutôt que "default" : la session de
# connexion root (aws login) ne peut pas cohabiter avec un
# credential_process sur le même profil - "terraform" pointe vers
# "default" via `aws configure export-credentials`, relu à chaque appel.
# Rafraîchir la session ("aws login") suffit désormais, sans jamais
# retoucher ~/.aws/config (friction identifiée en conditions réelles,
# 2026-08-17).
export AWS_PROFILE=terraform

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$INFRA_DIR/.." && pwd)"

api_repo_url=$(terraform -chdir="$INFRA_DIR" output -raw ecr_api_repository_url)
mcp_repo_url=$(terraform -chdir="$INFRA_DIR" output -raw ecr_mcp_repository_url)
api_function_name=$(terraform -chdir="$INFRA_DIR" output -raw lambda_api_function_name)
mcp_function_name=$(terraform -chdir="$INFRA_DIR" output -raw lambda_mcp_function_name)

# L'URL d'un dépôt ECR a la forme "<compte>.dkr.ecr.<région>.amazonaws.com/<nom>" -
# la région n'est pas exposée comme sortie séparée dans infra/outputs.tf,
# elle se lit directement dans cette URL plutôt que de dupliquer
# var.aws_region ici.
region=$(sed -E 's#^[0-9]+\.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com/.*#\1#' <<< "$api_repo_url")
registry=$(sed -E 's#^([0-9]+\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com)/.*#\1#' <<< "$api_repo_url")

echo "Connexion à ECR ($registry)..."
aws ecr get-login-password --region "$region" | docker login --username AWS --password-stdin "$registry"

# --provenance=false --sbom=false : Docker Buildx attache par défaut des
# attestations de provenance/SBOM, ce qui transforme l'image poussée en
# manifest list (OCI image index) plutôt qu'un manifest unique - AWS
# Lambda refuse ce format ("image manifest... not supported"), confirmé
# en conditions réelles (2026-08-17) : les deux premières images poussées
# sans ces flags ont fait échouer la création des fonctions Lambda malgré
# des push réussis sur ECR.
echo "Construction de legirag-api..."
docker build --provenance=false --sbom=false -f "$REPO_ROOT/packages/api/Dockerfile" -t "$api_repo_url:latest" "$REPO_ROOT"
echo "Envoi de legirag-api vers ECR..."
docker push "$api_repo_url:latest"

echo "Construction de legirag-mcp..."
docker build --provenance=false --sbom=false -f "$REPO_ROOT/packages/mcp/Dockerfile" -t "$mcp_repo_url:latest" "$REPO_ROOT"
echo "Envoi de legirag-mcp vers ECR..."
docker push "$mcp_repo_url:latest"

# Sur le tout premier déploiement, ces fonctions n'existent pas encore
# (terraform apply échoue dessus tant qu'aucune image n'existe - voir
# infra/README.md) : update-function-code échouerait alors avec "Function
# not found", ce qui n'est pas une vraie erreur ici, juste ce script
# appelé avant le second `terraform apply` qui créera les fonctions
# directement avec l'image déjà poussée. Confirmé en conditions réelles
# (2026-08-17) : la première tentative de ce script faisait échouer tout
# le script à cette étape avec `set -e`, malgré des images correctement
# poussées - corrigé pour vérifier l'existence d'abord.
deploy_function() {
  local function_name="$1"
  local image_uri="$2"
  if aws lambda get-function --function-name "$function_name" >/dev/null 2>&1; then
    echo "Redéploiement de $function_name..."
    aws lambda update-function-code --function-name "$function_name" --image-uri "$image_uri" >/dev/null
    # update-function-code est asynchrone - sans cette attente, lancer ce
    # script deux fois de suite (ou une future automatisation en
    # parallèle) ferait échouer le second appel avec
    # ResourceConflictException sur une fonction encore en cours de mise
    # à jour (audit, 2026-08-18).
    aws lambda wait function-updated-v2 --function-name "$function_name"
  else
    echo "$function_name n'existe pas encore - l'image est poussée, le prochain terraform apply la créera avec."
  fi
}

deploy_function "$api_function_name" "$api_repo_url:latest"
deploy_function "$mcp_function_name" "$mcp_repo_url:latest"

echo "Terminé."
