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

  @Get('developing')
  developing() {
    return this.events.listDeveloping();
  }

  // F5 — stories heating up (coverage accelerating). Static route before ':id'.
  @Get('rising')
  rising(@Query('window') window?: string) {
    const h = window ? Number(window) : undefined;
    return this.events.listRising(8, h && h > 0 ? h : undefined);
  }

  @Get('blindspots')
  blindspots() {
    return this.events.listBlindspots();
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
