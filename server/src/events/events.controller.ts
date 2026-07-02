import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@Query('from') from?: string) {
    const fromDate = from ? new Date(from) : undefined;
    return this.events.listEvents(
      24,
      fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
    );
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
