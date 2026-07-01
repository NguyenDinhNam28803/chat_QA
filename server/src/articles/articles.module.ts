import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { FeaturesController } from './features.controller';

@Module({
  imports: [LlmModule],
  providers: [ArticlesService],
  controllers: [ArticlesController, FeaturesController],
})
export class ArticlesModule {}
