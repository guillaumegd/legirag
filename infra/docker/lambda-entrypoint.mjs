#!/usr/bin/env node
// Amorçage Lambda (12d) : lit le secret app-env via l'API Secrets Manager
// (identifiants fournis automatiquement par le runtime Lambda - rôle
// d'exécution, voir infra/iam.tf), l'injecte dans l'environnement du
// processus, puis lance le vrai serveur (node dist/main.js ou
// dist/index.js). Jamais de valeur de secret en clair dans la
// configuration de la fonction Lambda elle-même (infra/lambda.tf ne porte
// que APP_SECRET_ID, une référence). Plomberie Lambda pure, volontairement
// hors de packages/api/src et packages/mcp/src - voir current-feature.md.
//
// SDK appelé directement plutôt que via l'extension AWS Parameters and
// Secrets : cette dernière n'est distribuée qu'en couche Lambda (zip), pas
// en image conteneur publique - impossible à copier dans une image
// conteneur sans identifiants AWS réels au moment du build (confirmé en
// creusant l'option pendant cette session, voir la note de révision du
// 2026-08-17 dans current-feature.md).

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { spawnSync } from 'node:child_process';

async function main() {
  const secretId = process.env.APP_SECRET_ID;
  if (secretId) {
    const client = new SecretsManagerClient({});
    const { SecretString } = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    for (const [key, value] of Object.entries(JSON.parse(SecretString))) {
      process.env[key] = value;
    }
  }

  const [command, ...args] = process.argv.slice(2);
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error("Échec de l'amorçage Lambda :", error);
  process.exit(1);
});
