import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { INGESTION_QUEUE, JOB_FETCH_FEED } from './ingestion.constants';
import { DEFAULT_FEEDS } from './feeds.config';

@Injectable()
export class IngestionScheduler implements OnModuleInit {
  constructor(@InjectQueue(INGESTION_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    // Opt-out switch: set INGEST_ON_BOOT=false to skip auto-ingestion. Ingestion
    // and chat share one Ollama, so background ingest can starve question-embeds.
    // Disable it when you need a snappy chat demo; re-enable for fresh news.
    if (process.env.INGEST_ON_BOOT === 'false') {
      console.log('IngestionScheduler: disabled (INGEST_ON_BOOT=false)');
      return;
    }
    console.log('IngestionScheduler: Initializing...');
    await this.queue.drain(); // Clear old jobs
    for (const feed of DEFAULT_FEEDS) {
      await this.queue.add(JOB_FETCH_FEED, feed, {
        repeat: { every: 30 * 60 * 1000 },
        jobId: `feed:${feed.id}`,
        removeOnComplete: true,
        removeOnFail: 50,
      });
    }
    console.log('IngestionScheduler: Scheduled', DEFAULT_FEEDS.length, 'feeds');
  }
}
