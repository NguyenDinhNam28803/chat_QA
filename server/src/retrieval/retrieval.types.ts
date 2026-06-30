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

export interface RetrievalResult {
  context: string;
  citations: Citation[];
}
