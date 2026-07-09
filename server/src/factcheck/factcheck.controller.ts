import { Controller, Get, Query } from '@nestjs/common';
import { FactcheckService } from './factcheck.service';

@Controller('factcheck')
export class FactcheckController {
  constructor(private readonly factcheck: FactcheckService) {}

  @Get()
  check(@Query('claim') claim: string) {
    return this.factcheck.check(claim ?? '');
  }

  // (B4) Explicit web-augmented check — external, unverified sources.
  @Get('online')
  online(@Query('claim') claim: string) {
    return this.factcheck.checkOnline(claim ?? '');
  }
}
