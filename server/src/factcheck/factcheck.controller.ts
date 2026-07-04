import { Controller, Get, Query } from '@nestjs/common';
import { FactcheckService } from './factcheck.service';

@Controller('factcheck')
export class FactcheckController {
  constructor(private readonly factcheck: FactcheckService) {}

  @Get()
  check(@Query('claim') claim: string) {
    return this.factcheck.check(claim ?? '');
  }
}
