import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { RetrievalModule } from './retrieval/retrieval.module';
import { LlmModule } from './llm/llm.module';
import { ChatModule } from './chat/chat.module';
import { HealthModule } from './health/health.module';
import { ArticlesModule } from './articles/articles.module';
import { EventsModule } from './events/events.module';
import { PeriodsModule } from './periods/periods.module';
import { FactcheckModule } from './factcheck/factcheck.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EmbeddingModule,
    IngestionModule,
    RetrievalModule,
    LlmModule,
    ChatModule,
    HealthModule,
    ArticlesModule,
    EventsModule,
    PeriodsModule,
    FactcheckModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
