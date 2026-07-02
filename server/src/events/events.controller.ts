import { Controller, Get, Param, Post } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list() {
    return this.events.listEvents();
  }

  @Post('cluster')
  cluster() {
    return this.events.cluster();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.events.getEvent(id);
  }
}
