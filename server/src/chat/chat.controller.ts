import { Controller, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Sse('stream')
  stream(
    @Query('q') q: string,
    @Query('conversationId') conversationId?: string,
  ): Observable<MessageEvent> {
    return this.chat.stream(q, conversationId);
  }
}
