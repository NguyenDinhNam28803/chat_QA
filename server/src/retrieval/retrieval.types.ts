export interface RetrievedChunk {
  content: string;
  articleId: string;
  url: string;
  title: string;
  source: string;
  distance: number;
}

export interface Citation {
  index: number;
  articleId: string;
  url: string;
  title: string;
  source: string;
}

export interface Confidence {
  level: 'high' | 'medium' | 'low';
  sources: number; // distinct source articles backing the answer
  minDistance: number; // best (smallest) cosine distance among retrieved chunks
}

export interface RetrievalResult {
  context: string;
  citations: Citation[];
  confidence: Confidence;
}
