import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';

@Module({
  imports: [LlmModule],
  providers: [EventsService],
  controllers: [EventsController],
})
export class EventsModule {}
