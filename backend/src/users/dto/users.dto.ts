import {
  IsOptional,
  IsString,
  MaxLength,
  IsIn,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsappNumber?: string;

  @IsOptional()
  @IsBoolean()
  autoPayEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  biometricEnabled?: boolean;
}

export class UpdateLanguageDto {
  @IsIn(['en', 'sw', 'fr'])
  language!: 'en' | 'sw' | 'fr';
}

export class UpdateStatusDto {
  @IsIn(['active', 'suspended', 'pending', 'removed'])
  status!: UserStatus;
}

export class ListUsersQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;
}
