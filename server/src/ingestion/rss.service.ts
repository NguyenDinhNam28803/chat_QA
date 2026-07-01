import { Injectable, Logger } from '@nestjs/common';
import Parser from 'rss-parser';
import { FeedSource } from './feeds.config';

export interface RawFeedItem {
  url: string;
  title: string;
  source: string;
  publishedAt: Date | null;
  summaryHtml: string;
}

// Cap items per feed run so a huge feed (e.g. VietNamNet returns ~1000) can't
// dominate the queue and starve the other feeds. We take the newest N; the
// 30-min repeat picks up the rest over time.
const MAX_ITEMS_PER_FEED = 60;

@Injectable()
export class RssService {
  private readonly logger = new Logger(RssService.name);
  private readonly parser = new Parser();

  async fetchFeed(feed: FeedSource): Promise<RawFeedItem[]> {
    const parsed = await this.parser.parseURL(feed.url);
    const items = (parsed.items ?? [])
      .filter((i) => i.link && i.title)
      .slice(0, MAX_ITEMS_PER_FEED)
      .map((i) => {
        const encoded = (i as { 'content:encoded'?: string })[
          'content:encoded'
        ];
        return {
          url: i.link!.trim(),
          title: i.title!.trim(),
          source: feed.name,
          publishedAt: i.isoDate ? new Date(i.isoDate) : null,
          summaryHtml: encoded ?? i.content ?? i.contentSnippet ?? '',
        };
      });
    this.logger.log(`Feed ${feed.id}: ${items.length} items`);
    return items;
  }
}
