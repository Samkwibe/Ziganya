import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    if (url) {
      // Managed Redis (e.g. Upstash) — TLS required. `rediss://` enables TLS
      // automatically; for `redis://` URLs we opt in explicitly.
      const useTls = url.startsWith('rediss://') || /upstash\.io/i.test(url);
      this.client = new Redis(url, {
        maxRetriesPerRequest: 3,
        ...(useTls ? { tls: {} } : {}),
      });
    } else {
      // Local Docker Compose fallback.
      this.client = new Redis({
        host: config.get<string>('REDIS_HOST', 'localhost'),
        port: Number(config.get('REDIS_PORT', 6379)),
        password: config.get<string>('REDIS_PASSWORD') || undefined,
        maxRetriesPerRequest: 3,
      });
    }
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  /** Store a refresh-token reference keyed by user + jti with a TTL (seconds). */
  async setRefreshToken(userId: string, jti: string, ttlSeconds: number): Promise<void> {
    await this.client.set(this.refreshKey(userId, jti), '1', 'EX', ttlSeconds);
  }

  async isRefreshTokenValid(userId: string, jti: string): Promise<boolean> {
    return (await this.client.exists(this.refreshKey(userId, jti))) === 1;
  }

  async revokeRefreshToken(userId: string, jti: string): Promise<void> {
    await this.client.del(this.refreshKey(userId, jti));
  }

  /** Revoke every active session for a user (logout-all / suspension). */
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    const keys = await this.client.keys(this.refreshKey(userId, '*'));
    if (keys.length) await this.client.del(...keys);
  }

  // ── Login attempt lockout (spec §15.1: 5 attempts → 15-min lock) ──
  async incrementLoginAttempts(identifier: string): Promise<number> {
    const key = `login:attempts:${identifier}`;
    const count = await this.client.incr(key);
    if (count === 1) await this.client.expire(key, 15 * 60);
    return count;
  }

  async resetLoginAttempts(identifier: string): Promise<void> {
    await this.client.del(`login:attempts:${identifier}`);
  }

  // ── OTP storage (short-lived, single-use) ──
  async setOtp(identifier: string, code: string, ttlSeconds = 120): Promise<void> {
    await this.client.set(`otp:${identifier}`, code, 'EX', ttlSeconds);
  }

  async consumeOtp(identifier: string, code: string): Promise<boolean> {
    const key = `otp:${identifier}`;
    const stored = await this.client.get(key);
    if (stored && stored === code) {
      await this.client.del(key);
      return true;
    }
    return false;
  }

  private refreshKey(userId: string, jti: string): string {
    return `refresh:${userId}:${jti}`;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
