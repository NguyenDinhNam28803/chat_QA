import { Controller, Get, Query } from '@nestjs/common';
import { ArticlesService } from './articles.service';

/** Root-level AI feature endpoints (brief / timeline / compare / insights). */
@Controller()
export class FeaturesController {
  constructor(private readonly articles: ArticlesService) {}

  @Get('brief')
  brief() {
    return this.articles.dailyBrief();
  }

  @Get('timeline')
  timeline(@Query('q') q: string) {
    return this.articles.timeline(q ?? '');
  }

  @Get('compare')
  compare(@Query('q') q: string) {
    return this.articles.compare(q ?? '');
  }

  @Get('insights')
  insights() {
    return this.articles.insights();
  }
}
