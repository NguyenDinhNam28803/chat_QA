import { Controller, Post } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { INGESTION_QUEUE, JOB_FETCH_FEED } from './ingestion.constants';
import { DEFAULT_FEEDS } from './feeds.config';
import { IngestionService } from './ingestion.service';

@Controller('ingestion')
export class IngestionController {
  constructor(
    @InjectQueue(INGESTION_QUEUE) private readonly queue: Queue,
    private readonly ingestion: IngestionService,
  ) {}

  @Post('run')
  async run(): Promise<{ enqueued: number }> {
    for (const feed of DEFAULT_FEEDS) {
      await this.queue.add(JOB_FETCH_FEED, feed);
    }
    return { enqueued: DEFAULT_FEEDS.length };
  }

  // F2 one-off: compute titleBodyScore for articles ingested before the feature.
  @Post('backfill-clickbait')
  backfillClickbait(): Promise<{ updated: number; skipped: number }> {
    return this.ingestion.backfillClickbait();
  }
}
