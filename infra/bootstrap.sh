#!/usr/bin/env bash
# Premier déploiement complet, de zéro à des fonctions Lambda vivantes sur
# un compte AWS qui n'a encore rien de ce projet. Rejoue la séquence
# découverte en conditions réelles (2026-08-17, voir infra/README.md pour
# le détail) : le tout premier `terraform apply` échoue TOUJOURS sur les
# deux fonctions Lambda - aucune image n'existe encore dans les dépôts ECR
# qu'il vient tout juste de créer, et Terraform ne peut pas pousser une
# image lui-même. C'est attendu, pas une panne : ce script continue
# volontairement après cet échec précis plutôt que d'interrompre tout de
# suite.
#
# Pour un redéploiement (juste du nouveau code, l'infra existe déjà),
# utiliser directement ./deploy-images.sh - pas ce script.
#
# Prérequis, à faire toi-même avant de lancer ce script (voir
# infra/README.md pour le détail de chacun) :
#   - identifiants AWS valides et configurés (aws sts get-caller-identity
#     doit répondre)
#   - Terraform, Docker et le CLI AWS installés localement
#   - un plafond de facturation AWS configuré (recommandé, pas vérifié par
#     ce script)
set -uo pipefail

# Profil "terraform" (~/.aws/config) - voir le commentaire équivalent dans
# deploy-images.sh.
export AWS_PROFILE=terraform

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== 1/4 - terraform init ==="
terraform -chdir="$INFRA_DIR" init || { echo "Échec de terraform init - arrêt." >&2; exit 1; }

echo ""
echo "=== 2/4 - premier terraform apply (échec attendu sur les fonctions Lambda) ==="
terraform -chdir="$INFRA_DIR" apply -auto-approve
# Pas de vérification du code de sortie ici, volontairement : cette étape
# échoue par construction (voir le commentaire en tête de fichier).

echo ""
echo "=== 3/4 - construction et envoi des images vers ECR ==="
"$INFRA_DIR/deploy-images.sh" || { echo "Échec de deploy-images.sh - arrêt." >&2; exit 1; }

echo ""
echo "=== 4/4 - second terraform apply (crée les fonctions Lambda) ==="
terraform -chdir="$INFRA_DIR" apply -auto-approve || { echo "Échec du second apply - arrêt." >&2; exit 1; }

echo ""
echo "Infrastructure créée. Il reste une étape manuelle :"
echo "  1. Crée .env.prod à la racine du repo si ce n'est pas déjà fait (cp .env .env.prod)"
echo "  2. pnpm deploy:secrets"
echo ""
echo "Les fonctions renverront une erreur tant que le secret contient encore les valeurs gabarit REPLACE_ME."
