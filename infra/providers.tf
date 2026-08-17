provider "aws" {
  region = var.aws_region
}

# Pas de provider "supabase" (fix, 2026-08-17) : aucune ressource ne s'en
# sert aujourd'hui, et un jeton Supabase donne accès à tout le compte (pas
# de permissions granulaires côté Supabase, contrairement à AWS/IAM) -
# créer ce jeton pour rien n'aurait ajouté qu'un risque. À réintroduire le
# jour où une vraie fonctionnalité gère une ressource Supabase via
# Terraform, avec la réflexion sur les permissions qui va avec à ce
# moment-là.
