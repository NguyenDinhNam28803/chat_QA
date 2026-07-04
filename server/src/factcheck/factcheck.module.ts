import { Module } from '@nestjs/common';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { LlmModule } from '../llm/llm.module';
import { FactcheckService } from './factcheck.service';
import { FactcheckController } from './factcheck.controller';

@Module({
  imports: [RetrievalModule, LlmModule],
  providers: [FactcheckService],
  controllers: [FactcheckController],
})
export class FactcheckModule {}
