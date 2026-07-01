import { Body, Controller, Get, Param, Post, Query, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Sse('stream')
  stream(
    @Query('q') q: string,
    @Query('conversationId') conversationId?: string,
    @Query('topic') topic?: string,
  ): Observable<MessageEvent> {
    return this.chat.stream(q, conversationId, topic);
  }

  /** History sidebar: list past conversations (newest first). */
  @Get('conversations')
  listConversations() {
    return this.chat.listConversations();
  }

  /** Reopen a conversation: all its messages in order. */
  @Get('conversations/:id/messages')
  getMessages(@Param('id') id: string) {
    return this.chat.getMessages(id);
  }

  @Post('messages/:id/feedback')
  feedback(@Param('id') id: string, @Body() body: { value: number }) {
    return this.chat.setFeedback(id, Number(body?.value ?? 0));
  }
}
