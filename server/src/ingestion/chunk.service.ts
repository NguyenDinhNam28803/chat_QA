import { Injectable } from '@nestjs/common';
import { encode } from 'gpt-tokenizer';

export interface TextChunk {
  ord: number;
  content: string;
  tokenCount: number;
}

const MAX_TOKENS = 400;
const OVERLAP_TOKENS = 50;

@Injectable()
export class ChunkService {
  chunk(text: string): TextChunk[] {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const words = clean.split(' ');
    const chunks: TextChunk[] = [];
    let ord = 0;
    let start = 0;
    while (start < words.length) {
      let end = start;
      let tokenCount = 0;
      while (end < words.length) {
        const next = encode(words[end] + ' ').length;
        if (tokenCount + next > MAX_TOKENS) break;
        tokenCount += next;
        end++;
      }
      if (end === start) end = start + 1;
      const content = words.slice(start, end).join(' ');
      chunks.push({ ord: ord++, content, tokenCount: encode(content).length });
      if (end >= words.length) break;
      const overlapWords = Math.min(end - start, Math.ceil(OVERLAP_TOKENS / 2));
      start = end - overlapWords;
    }
    return chunks;
  }
}
