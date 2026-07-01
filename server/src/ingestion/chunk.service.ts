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
  /**
   * Sentence-aware chunking: accumulate whole sentences up to ~400 tokens so we
   * never cut mid-sentence (better embeddings). A single sentence longer than
   * the budget falls back to a word-window split. Consecutive chunks overlap by
   * carrying the trailing sentence when it fits.
   */
  chunk(text: string): TextChunk[] {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return [];

    const sentences = clean.split(/(?<=[.!?…])\s+/).filter((s) => s.length > 0);

    const contents: string[] = [];
    let buf: string[] = [];
    let bufTok = 0;
    const flush = () => {
      if (buf.length) {
        contents.push(buf.join(' '));
        buf = [];
        bufTok = 0;
      }
    };

    for (const s of sentences) {
      const st = encode(s + ' ').length;

      // Oversized single sentence -> flush, then word-window split it.
      if (st > MAX_TOKENS) {
        flush();
        for (const w of this.splitWords(s)) contents.push(w);
        continue;
      }

      if (bufTok + st > MAX_TOKENS) {
        const last = buf[buf.length - 1];
        flush();
        const lt = last ? encode(last + ' ').length : 0;
        // Carry the previous sentence as overlap only if it still fits.
        if (last && lt + st <= MAX_TOKENS) {
          buf = [last];
          bufTok = lt;
        }
      }
      buf.push(s);
      bufTok += st;
    }
    flush();

    return contents.map((content, i) => ({
      ord: i,
      content,
      tokenCount: encode(content).length,
    }));
  }

  /** Word-window split with overlap — used for sentences over the token budget. */
  private splitWords(text: string): string[] {
    const words = text.split(' ');
    const out: string[] = [];
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
      out.push(words.slice(start, end).join(' '));
      if (end >= words.length) break;
      const overlapWords = Math.min(end - start, Math.ceil(OVERLAP_TOKENS / 2));
      start = end - overlapWords;
    }
    return out;
  }
}
