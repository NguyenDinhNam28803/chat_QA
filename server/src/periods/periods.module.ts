import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { PeriodsService } from './periods.service';
import { PeriodsController } from './periods.controller';

@Module({
  imports: [LlmModule],
  providers: [PeriodsService],
  controllers: [PeriodsController],
})
export class PeriodsModule {}
