import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID, randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  RegisterDto,
  LoginDto,
  VerifyOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import twilio from 'twilio';
import { Logger } from '@nestjs/common';

const MAX_LOGIN_ATTEMPTS = 5; // spec §15.1



@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) { }


  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { phoneNumber: dto.phoneNumber }] },
    });
    if (existing) {
      throw new ConflictException('Email or phone number already in use');
    }

    const cost = Number(this.config.get('BCRYPT_COST', 12));
    const passwordHash = await bcrypt.hash(dto.password, cost);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email,
        phoneNumber: dto.phoneNumber,
        passwordHash,
        countryCode: dto.countryCode,
        language: dto.language ?? 'en',
        status: 'pending', // becomes "active" after admin/onboarding flow
      },
    });

    // Issue an OTP the client must verify (stubbed: returned in dev, sent via
    // Twilio Verify in production — spec §4 / §7.1).
    const otp = await this.issueOtp(dto.phoneNumber);
    const tokens = await this.issueTokens(user);
    return { user: this.sanitize(user), ...tokens, devOtp: this.devOtp(otp) };
  }

  async login(dto: LoginDto) {
    const identifier = dto.identifier.toLowerCase();
    const attempts = await this.redis.incrementLoginAttempts(identifier);
    if (attempts > MAX_LOGIN_ATTEMPTS) {
      throw new ForbiddenException('Account temporarily locked. Try again in 15 minutes.');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { phoneNumber: dto.identifier }],
        deletedAt: null,
      },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status === 'suspended' || user.status === 'removed') {
      throw new ForbiddenException('Account is not active');
    }

    await this.redis.resetLoginAttempts(identifier);
    const tokens = await this.issueTokens(user);
    return { user: this.sanitize(user), ...tokens };
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload & { jti: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: this.jwtSecret() });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const valid = await this.redis.isRefreshTokenValid(payload.sub, payload.jti);
    if (!valid) throw new UnauthorizedException('Refresh token revoked');

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.deletedAt) throw new UnauthorizedException();

    // Rotate: invalidate the used refresh token, issue a fresh pair.
    await this.redis.revokeRefreshToken(payload.sub, payload.jti);
    return this.issueTokens(user);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      try {
        const payload = await this.jwt.verifyAsync<JwtPayload & { jti: string }>(refreshToken, {
          secret: this.jwtSecret(),
        });
        await this.redis.revokeRefreshToken(payload.sub, payload.jti);
        return { success: true };
      } catch {
        // fall through to revoke-all
      }
    }
    await this.redis.revokeAllRefreshTokens(userId);
    return { success: true };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const ok = await this.redis.consumeOtp(dto.identifier, dto.code);
    if (!ok) throw new UnauthorizedException('Invalid or expired OTP');

    // Activate the account on successful verification.
    await this.prisma.user.updateMany({
      where: { OR: [{ phoneNumber: dto.identifier }, { email: dto.identifier.toLowerCase() }] },
      data: { status: 'active' },
    });
    return { verified: true };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const otp = await this.issueOtp(dto.identifier);
    // Always return success to avoid user enumeration (spec §15).
    return { sent: true, devOtp: this.devOtp(otp) };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const ok = await this.redis.consumeOtp(dto.identifier, dto.code);
    if (!ok) throw new UnauthorizedException('Invalid or expired OTP');

    const cost = Number(this.config.get('BCRYPT_COST', 12));
    const passwordHash = await bcrypt.hash(dto.newPassword, cost);
    await this.prisma.user.updateMany({
      where: { OR: [{ phoneNumber: dto.identifier }, { email: dto.identifier.toLowerCase() }] },
      data: { passwordHash },
    });
    return { reset: true };
  }

  // ── helpers ──────────────────────────────────────────────
  /** Single signing secret (spec: JWT_SECRET). */
  private jwtSecret(): string {
    const jwtSecret = this.config.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    return jwtSecret;
  }


  private async issueTokens(user: User) {
    // Env values arrive as strings; coerce so jsonwebtoken treats them as
    // seconds (a numeric string would be parsed as milliseconds by `ms`).
    const accessTtl = Number(this.config.get('JWT_ACCESS_EXPIRES_IN', 900));
    const refreshTtl = Number(this.config.get('JWT_REFRESH_EXPIRES_IN', 2_592_000));
    const secret = this.jwtSecret();
    const jti = randomUUID();

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role } satisfies JwtPayload,
      { secret, expiresIn: accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role, jti },
      { secret, expiresIn: refreshTtl },
    );

    await this.redis.setRefreshToken(user.id, jti, refreshTtl);
    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  private async issueOtp(identifier: string): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis.setOtp(identifier, code, 120); // 2-minute expiry (spec §17.1)
    await this.sendOtp(identifier);
    return code;
  }

  private getTwilioClient() {
    // Twilio is optional for dev; production requires TWILIO_* env vars.
    return twilio(
      this.config.get('TWILIO_ACCOUNT_SID'),
      this.config.get('TWILIO_AUTH_TOKEN'),
    );
  }

  async sendOtp(phoneNumber: string): Promise<void> {
    const serviceId = this.config.get('TWILIO_VERIFY_SERVICE_SID');
    if (!serviceId) {
      // Dev mode: OTP is already stored in Redis and optionally returned via devOtp.
      return;
    }


    await this.getTwilioClient()
      .verify.v2
      .services(serviceId)
      .verifications.create({ to: phoneNumber, channel: 'sms' });
  }

  private async checkOtp(phoneNumber: string, code: string): Promise<boolean> {
    const serviceId = this.config.get('TWILIO_VERIFY_SERVICE_SID');
    if (!serviceId) {
      const stored = await this.redis.consumeOtp(`dev:${phoneNumber}`, code);
      return stored;
    }

    const result = await this.getTwilioClient()
      .verify.v2
      .services(serviceId)
      .verificationChecks.create({ to: phoneNumber, code });

    return result.status === 'approved';
  }


  /** Only expose the OTP in non-production so the mobile client can auto-fill in dev. */
  private devOtp(code: string): string | undefined {
    return this.config.get<string>('NODE_ENV') === 'production' ? undefined : code;
  }

  private sanitize(user: User) {
    const { passwordHash, mfaSecret, ...safe } = user;
    void passwordHash;
    void mfaSecret;
    return safe;
  }
}
