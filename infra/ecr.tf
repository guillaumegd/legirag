# Item 12d - un dépôt par image, correspondant 1:1 aux deux Dockerfiles du
# repo (packages/api, packages/mcp).

resource "aws_ecr_repository" "api" {
  name                 = "legirag-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "legirag-api" }
}

resource "aws_ecr_repository" "mcp" {
  name                 = "legirag-mcp"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = { Name = "legirag-mcp" }
}
