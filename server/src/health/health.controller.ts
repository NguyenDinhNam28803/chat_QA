import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  async check(): Promise<{
    status: 'ok' | 'degraded';
    checks: Record<string, string>;
    uptimeSec: number;
  }> {
    const checks: Record<string, string> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }

    const endpoints: [string, string][] = [
      [
        'ollamaChat',
        this.config.get('EMBEDDING_BASE_URL', 'http://localhost:11434'),
      ],
      [
        'ollamaIngest',
        this.config.get('EMBEDDING_INGEST_BASE_URL', 'http://localhost:11435'),
      ],
    ];
    await Promise.all(
      endpoints.map(async ([name, url]) => {
        try {
          const res = await fetch(`${url.replace(/\/$/, '')}/api/version`);
          checks[name] = res.ok ? 'up' : 'down';
        } catch {
          checks[name] = 'down';
        }
      }),
    );

    const status = Object.values(checks).every((v) => v === 'up')
      ? 'ok'
      : 'degraded';
    return { status, checks, uptimeSec: Math.round(process.uptime()) };
  }
}
