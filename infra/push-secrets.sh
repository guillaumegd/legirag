#!/usr/bin/env bash
# Pousse les valeurs de .env.prod (racine du repo) vers le secret Secrets
# Manager que Terraform a créé (infra/secrets.tf) - remplace ses valeurs
# gabarit "REPLACE_ME" par les vraies. lifecycle.ignore_changes sur
# secret_string (infra/secrets.tf) garantit qu'un futur terraform apply
# n'écrasera jamais ce que ce script vient de pousser.
#
# .env.prod n'existe pas par défaut - crée-le en copiant .env
# (cp .env .env.prod) puis ajuste les valeurs si jamais elles doivent
# différer de l'environnement de dev local. Toujours gitignored (voir
# .gitignore) : ne jamais committer ce fichier.
#
# Parseur .env minimal en Node natif, sans dépendance npm (ex. "dotenv"
# n'est pas installé dans ce repo) - lit uniquement les clés attendues par
# infra/secrets.tf, échoue si l'une d'elles manque plutôt que de pousser
# un secret incomplet.
set -euo pipefail

# Profil "terraform" (~/.aws/config) - voir le commentaire équivalent dans
# deploy-images.sh.
export AWS_PROFILE=terraform

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$INFRA_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env.prod"

if [ ! -f "$ENV_FILE" ]; then
  echo "Erreur : $ENV_FILE introuvable." >&2
  echo "Crée-le à la racine du repo (par exemple : cp .env .env.prod), puis relance ce script." >&2
  exit 1
fi

secret_id=$(terraform -chdir="$INFRA_DIR" output -raw secret_id)

payload=$(node -e '
  const fs = require("fs");
  const env = {};
  for (const line of fs.readFileSync(process.argv[1], "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("\x27") && v.endsWith("\x27"))) v = v.slice(1, -1);
    env[t.slice(0, i).trim()] = v;
  }
  const keys = ["AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY","AWS_REGION","MODEL_VOLUME","MODEL_ESCALADE","MODEL_EMBEDDING","SUPABASE_URL","SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY","DATABASE_URL"];
  const missing = keys.filter((k) => !env[k]);
  if (missing.length > 0) {
    console.error("Clés manquantes dans " + process.argv[1] + " : " + missing.join(", "));
    process.exit(1);
  }
  console.log(JSON.stringify(Object.fromEntries(keys.map((k) => [k, env[k]]))));
' "$ENV_FILE")

aws secretsmanager put-secret-value \
  --secret-id "$secret_id" \
  --secret-string file://<(printf '%s' "$payload") >/dev/null

echo "Secret $secret_id mis à jour depuis $ENV_FILE."
