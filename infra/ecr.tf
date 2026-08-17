# Item 12d - un dépôt par image, correspondant 1:1 aux deux Dockerfiles du
# repo (packages/api, packages/mcp).
#
# force_delete = true (fix, 2026-08-18) : sans ça, `terraform destroy`
# échoue purement et simplement dès qu'une image existe dans le dépôt -
# confirmé en conditions réelles, ces deux dépôts contiennent déjà une
# image poussée par infra/deploy-images.sh. Les images sont triviales à
# reconstruire (docker build), donc rien ne justifie de bloquer un destroy
# pour les protéger.

resource "aws_ecr_repository" "api" {
  name                 = "legirag-api"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "legirag-api" }
}

resource "aws_ecr_repository" "mcp" {
  name                 = "legirag-mcp"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "legirag-mcp" }
}
