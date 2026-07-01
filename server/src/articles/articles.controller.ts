import { Controller, Get, Param, Query } from '@nestjs/common';
import { ArticlesService } from './articles.service';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  // Declare static routes before ':id' so they aren't captured by the param.
  @Get('topics')
  topics() {
    return this.articles.listTopics();
  }

  @Get()
  list(
    @Query('q') q?: string,
    @Query('topic') topic?: string,
    @Query('page') page?: string,
  ) {
    return this.articles.search(q, topic, page ? Number(page) : 1);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.articles.getById(id);
  }
}
