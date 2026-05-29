import { Controller, Get } from '@nestjs/common';

import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';
import { Public } from './auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  async check() {
    const [db, cache] = await Promise.all([this.pingDb(), this.pingRedis()]);
    const ok = db && cache;
    return {
      status: ok ? 'ok' : 'degraded',
      services: { database: db ? 'up' : 'down', redis: cache ? 'up' : 'down' },
      timestamp: new Date().toISOString(),
    };
  }

  private async pingDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async pingRedis(): Promise<boolean> {
    try {
      return (await this.redis.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
