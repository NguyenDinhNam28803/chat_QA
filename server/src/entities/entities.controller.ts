import { Controller, Get, Param } from '@nestjs/common';
import { EntitiesService } from './entities.service';

@Controller('entities')
export class EntitiesController {
  constructor(private readonly entities: EntitiesService) {}

  @Get()
  list() {
    return this.entities.listEntities();
  }

  @Get(':name')
  detail(@Param('name') name: string) {
    return this.entities.getEntity(decodeURIComponent(name));
  }
}
