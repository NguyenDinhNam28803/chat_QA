import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [UsageModule],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
