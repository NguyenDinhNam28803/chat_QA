'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Citation {
  index: number;
  url: string;
  title: string;
  source: string;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  feedback?: number | null;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
}

export interface TopicInfo {
  topic: string;
  label: string;
  count: number;
}

export type Phase = 'idle' | 'retrieving' | 'generating';

const API = process.env.NEXT_PUBLIC_API_URL;

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [topics, setTopics] = useState<TopicInfo[]>([]);
  const [topic, setTopic] = useState<string | undefined>();
  const esRef = useRef<EventSource | null>(null);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch(`${API}/chat/conversations`);
      if (res.ok) setConversations(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshList();
    void (async () => {
      try {
        const res = await fetch(`${API}/articles/topics`);
        if (res.ok) setTopics(await res.json());
      } catch {
        /* ignore */
      }
    })();
  }, [refreshList]);

  const loadConversation = useCallback(
    async (id: string) => {
      if (streaming) return;
      try {
        const res = await fetch(`${API}/chat/conversations/${id}/messages`);
        if (res.ok) {
          setMessages(await res.json());
          setConversationId(id);
        }
      } catch {
        /* ignore */
      }
    },
    [streaming],
  );

  const newConversation = useCallback(() => {
    if (streaming) return;
    setMessages([]);
    setConversationId(undefined);
  }, [streaming]);

  /** Stop an in-flight answer, keeping whatever streamed so far. */
  const stop = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setStreaming(false);
    setPhase('idle');
  }, []);

  function send(q: string) {
    const question = q.trim();
    if (!question || streaming) return;

    setMessages((m) => [
      ...m,
      { role: 'user', content: question },
      { role: 'assistant', content: '' },
    ]);
    setStreaming(true);
    setPhase('retrieving');

    let url = `${API}/chat/stream?q=${encodeURIComponent(question)}`;
    if (conversationId) url += `&conversationId=${conversationId}`;
    if (topic) url += `&topic=${encodeURIComponent(topic)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.token) {
        setPhase('generating');
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
            id: data.messageId as string,
            citations: data.citations as Citation[],
          };
          return copy;
        });
        const isNew = !conversationId;
        if (data.conversationId) setConversationId(data.conversationId);
        if (isNew) void refreshList();
        setStreaming(false);
        setPhase('idle');
        es.close();
        esRef.current = null;
      }
    };

    es.onerror = () => {
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last && last.role === 'assistant' && last.content === '') {
          copy[copy.length - 1] = {
            ...last,
            content:
              '⚠️ Không nhận được phản hồi (mô hình có thể đang quá tải hoặc mất kết nối). Vui lòng thử lại.',
          };
        }
        return copy;
      });
      setStreaming(false);
      setPhase('idle');
      es.close();
      esRef.current = null;
    };
  }

  /** 👍 (1) / 👎 (-1) an assistant message; sending the same value clears it. */
  const sendFeedback = useCallback((messageId: string, value: number) => {
    setMessages((m) =>
      m.map((msg) =>
        msg.id === messageId
          ? { ...msg, feedback: msg.feedback === value ? null : value }
          : msg,
      ),
    );
    const next =
      messages.find((msg) => msg.id === messageId)?.feedback === value
        ? 0
        : value;
    void fetch(`${API}/chat/messages/${messageId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: next }),
    }).catch(() => {});
  }, [messages]);

  return {
    messages,
    conversations,
    conversationId,
    streaming,
    phase,
    topics,
    topic,
    setTopic,
    send,
    stop,
    sendFeedback,
    loadConversation,
    newConversation,
  };
}
