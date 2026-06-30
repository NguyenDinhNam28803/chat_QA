import { Module } from '@nestjs/common';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { LlmModule } from '../llm/llm.module';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';

@Module({
  imports: [RetrievalModule, LlmModule],
  providers: [ChatService],
  controllers: [ChatController],
})
export class ChatModule {}
