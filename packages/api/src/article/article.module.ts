import { Module } from '@nestjs/common';
import { ArticleController } from './article.controller.js';

@Module({
  controllers: [ArticleController],
})
export class ArticleModule {}
