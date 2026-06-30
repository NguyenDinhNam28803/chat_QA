import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { INGESTION_QUEUE } from './ingestion.constants';
import { redisConnection } from '../config/redis.config';
import { EmbeddingModule } from '../embedding/embedding.module';
import { RssService } from './rss.service';
import { ContentExtractorService } from './content-extractor.service';
import { ChunkService } from './chunk.service';
import { IngestionService } from './ingestion.service';
import { IngestionProcessor } from './ingestion.processor';
import { IngestionScheduler } from './ingestion.scheduler';
import { IngestionController } from './ingestion.controller';

@Module({
  imports: [
    EmbeddingModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(config),
      }),
    }),
    BullModule.registerQueue({ name: INGESTION_QUEUE }),
  ],
  providers: [
    RssService,
    ContentExtractorService,
    ChunkService,
    IngestionService,
    IngestionProcessor,
    IngestionScheduler,
  ],
  controllers: [IngestionController],
})
export class IngestionModule {}
