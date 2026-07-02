import { Controller, Get, Param, Post } from '@nestjs/common';
import { PeriodsService } from './periods.service';

@Controller('periods')
export class PeriodsController {
  constructor(private readonly periods: PeriodsService) {}

  @Get('active')
  active() {
    return this.periods.getActive();
  }

  @Get()
  list() {
    return this.periods.listPeriods();
  }

  @Post('rollover')
  rollover() {
    return this.periods.rollover();
  }

  @Get('year/:year')
  year(@Param('year') year: string) {
    return this.periods.yearReview(Number(year));
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.periods.getPeriod(id);
  }
}
