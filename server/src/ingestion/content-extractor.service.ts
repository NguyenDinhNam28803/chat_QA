import { Injectable, Logger } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import * as cheerio from 'cheerio';

@Injectable()
export class ContentExtractorService {
  private readonly logger = new Logger(ContentExtractorService.name);

  async extract(url: string, fallbackHtml: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'NewsQABot/0.1' },
        signal: controller.signal,
      });
      if (res.ok) {
        const html = await res.text();
        const dom = new JSDOM(html, { url });
        const article = new Readability(dom.window.document).parse();
        const text = (article?.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (text.length > 200) return text;
      }
    } catch (err) {
      this.logger.warn(`extract failed for ${url}: ${String(err)}`);
    } finally {
      clearTimeout(timeout);
    }
    return cheerio.load(fallbackHtml).text().replace(/\s+/g, ' ').trim();
  }
}
