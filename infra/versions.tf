terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # >= 6.0 requis pour aws_lambda_permission.invoked_via_function_url,
      # nécessaire depuis qu'AWS exige lambda:InvokeFunction en plus de
      # lambda:InvokeFunctionUrl sur les Function URLs (octobre 2025) -
      # confirmé en conditions réelles (2026-08-17), 5.100.0 ne supportait
      # pas encore cet argument. Aucun changement cassant identifié pour
      # les ressources utilisées ici (guide de migration v6 officiel).
      version = "~> 6.0"
    }
  }

  # Pas de backend "s3" : état local délibéré (fix, 2026-08-17). Un seul
  # opérateur lance `terraform apply` occasionnellement depuis sa propre
  # machine - rien ici ne justifie l'état distant (verrouillage anti-
  # collision utile seulement à plusieurs personnes/CI en parallèle) ni la
  # complexité qu'il entraînait (bootstrap en 2 temps, ancien infra/state.tf).
  # `*.tfstate*` est dans .gitignore : le fichier d'état ne doit jamais être
  # commité (peut contenir des attributs sensibles), à sauvegarder comme
  # n'importe quel autre fichier local important. Revoir ce choix seulement
  # si un jour une CI ou un deuxième opérateur lance `apply`.
}
