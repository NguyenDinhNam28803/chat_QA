'use client';
import { useCallback, useEffect, useState } from 'react';

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

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
}

const API = process.env.NEXT_PUBLIC_API_URL;

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch(`${API}/chat/conversations`);
      if (res.ok) setConversations(await res.json());
    } catch {
      /* ignore — offline backend */
    }
  }, []);

  // Load the conversation list once on mount.
  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  /** Open a past conversation: load its messages into the view. */
  const loadConversation = useCallback(
    async (id: string) => {
      if (streaming) return;
      setLoadingHistory(true);
      try {
        const res = await fetch(`${API}/chat/conversations/${id}/messages`);
        if (res.ok) {
          const rows: ChatMessage[] = await res.json();
          setMessages(rows);
          setConversationId(id);
        }
      } finally {
        setLoadingHistory(false);
      }
    },
    [streaming],
  );

  /** Start a fresh conversation. */
  const newConversation = useCallback(() => {
    if (streaming) return;
    setMessages([]);
    setConversationId(undefined);
  }, [streaming]);

  function send(q: string) {
    const question = q.trim();
    if (!question || streaming) return;

    setMessages((m) => [
      ...m,
      { role: 'user', content: question },
      { role: 'assistant', content: '' },
    ]);
    setStreaming(true);

    let url = `${API}/chat/stream?q=${encodeURIComponent(question)}`;
    if (conversationId) url += `&conversationId=${conversationId}`;
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
        // Capture the conversation id (new chats get one here) + refresh sidebar.
        const isNew = !conversationId;
        if (data.conversationId) setConversationId(data.conversationId);
        if (isNew) void refreshList();
        setStreaming(false);
        es.close();
      }
    };

    es.onerror = () => {
      setStreaming(false);
      es.close();
    };
  }

  return {
    messages,
    conversations,
    conversationId,
    streaming,
    loadingHistory,
    send,
    loadConversation,
    newConversation,
  };
}
