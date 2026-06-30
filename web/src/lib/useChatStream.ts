'use client';
import { useState } from 'react';

export interface Citation {
  index: number;
  url: string;
  title: string;
  source: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
}

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);

  function send(q: string) {
    const question = q.trim();
    if (!question || streaming) return;

    setMessages((m) => [
      ...m,
      { role: 'user', content: question },
      { role: 'assistant', content: '' },
    ]);
    setStreaming(true);

    const url = `${process.env.NEXT_PUBLIC_API_URL}/chat/stream?q=${encodeURIComponent(question)}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.token) {
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { ...last, content: last.content + data.token };
          return copy;
        });
      } else if (data.done) {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            citations: data.citations as Citation[],
          };
          return copy;
        });
        setStreaming(false);
        es.close();
      }
    };

    es.onerror = () => {
      setStreaming(false);
      es.close();
    };
  }

  return { messages, send, streaming };
}
