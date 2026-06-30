import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { INGESTION_QUEUE, JOB_FETCH_FEED } from './ingestion.constants';
import { IngestionService } from './ingestion.service';
import { FeedSource } from './feeds.config';

@Processor(INGESTION_QUEUE)
export class IngestionProcessor extends WorkerHost {
  constructor(private readonly ingestion: IngestionService) {
    super();
  }

  async process(job: Job<FeedSource>): Promise<void> {
    if (job.name === JOB_FETCH_FEED) {
      await this.ingestion.ingestFeed(job.data);
    }
  }
}
