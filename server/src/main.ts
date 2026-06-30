import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Safety net: background ingestion fetches arbitrary news sites, and undici
  // (Node's fetch) can throw an async ERR_ASSERTION from a socket-end handler
  // when a remote server closes a TLS connection improperly. That throw escapes
  // our try/catch and would otherwise crash the whole server. Log and survive.
  process.on('uncaughtException', (err) => {
    logger.error(`uncaughtException (kept alive): ${err?.stack ?? String(err)}`);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`unhandledRejection (kept alive): ${String(reason)}`);
  });

  const app = await NestFactory.create(AppModule);
  // Web UI runs on 3001 (backend owns 3000). Allow it to read the SSE stream.
  app.enableCors({ origin: 'http://localhost:3001' });
  await app.listen(process.env.PORT ?? 3000);
  logger.log(`NewsQA backend listening on http://localhost:${process.env.PORT ?? 3000}`);
}
bootstrap();
