import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  UpdateProfileDto,
  UpdateLanguageDto,
  UpdateStatusDto,
  ListUsersQueryDto,
} from './dto/users.dto';

const PUBLIC_USER_FIELDS = {
  id: true,
  fullName: true,
  email: true,
  phoneNumber: true,
  profileImageUrl: true,
  role: true,
  status: true,
  language: true,
  countryCode: true,
  healthScore: true,
  churnRisk: true,
  totalInvested: true,
  totalBorrowed: true,
  whatsappNumber: true,
  autoPayEnabled: true,
  biometricEnabled: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: PUBLIC_USER_FIELDS,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  updateProfile(id: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: PUBLIC_USER_FIELDS,
    });
  }

  updateLanguage(id: string, dto: UpdateLanguageDto) {
    return this.prisma.user.update({
      where: { id },
      data: { language: dto.language },
      select: PUBLIC_USER_FIELDS,
    });
  }

  async list(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phoneNumber: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: PUBLIC_USER_FIELDS,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateStatus(id: string, dto: UpdateStatusDto) {
    const user = await this.ensureExists(id);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { status: dto.status },
      select: PUBLIC_USER_FIELDS,
    });
    // Force re-auth when suspending/removing an account.
    if (dto.status === 'suspended' || dto.status === 'removed') {
      await this.redis.revokeAllRefreshTokens(id);
    }
    return updated;
  }

  async softDelete(id: string) {
    await this.ensureExists(id);
    await this.prisma.user.update({
      where: { id },
      data: { status: 'removed', deletedAt: new Date() },
    });
    await this.redis.revokeAllRefreshTokens(id);
    return { deleted: true };
  }

  private async ensureExists(id: string): Promise<User> {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
