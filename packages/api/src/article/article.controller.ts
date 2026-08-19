import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type { Article, Subdivision } from '@legirag/shared';
import { fetchArticleByIdentifier } from '@legirag/retrieval';
import { ArticleQuerySchema, type ArticleQuery } from './article.dto.js';
import { ZodValidationPipe } from '../question/zod-validation.pipe.js';
import { FreeRead } from '../common/free-read.decorator.js';

@Controller('article')
export class ArticleController {
  @Get(':articleIdentifier')
  @FreeRead()
  async getByIdentifier(
    @Param('articleIdentifier') articleIdentifier: string,
    @Query(new ZodValidationPipe(ArticleQuerySchema)) query: ArticleQuery,
  ): Promise<{ article: Article; subdivisions: Subdivision[] }> {
    const dateReference = query.dateReference !== undefined ? new Date(query.dateReference) : new Date();
    const result = await fetchArticleByIdentifier(articleIdentifier, dateReference);
    if (result === undefined) {
      throw new NotFoundException(`Article introuvable ou non visible : ${articleIdentifier}`);
    }
    return result;
  }
}
