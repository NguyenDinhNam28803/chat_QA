import { ConfigService } from '@nestjs/config';

export function redisConnection(config: ConfigService) {
  return {
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: Number(config.get<string>('REDIS_PORT', '6379')),
  };
}
