import { Controller, Get, Param } from '@nestjs/common';
import { SourcesService } from './sources.service';

@Controller('sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get()
  list() {
    return this.sources.listSources();
  }

  @Get(':name')
  detail(@Param('name') name: string) {
    return this.sources.getSource(decodeURIComponent(name));
  }
}
