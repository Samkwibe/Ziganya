import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  MaxLength,
  IsIn,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @IsEmail()
  email!: string;

  // E.164 phone format (spec §6 users.phone_number).
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phoneNumber must be E.164 format' })
  phoneNumber!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  password!: string;

  @IsString()
  @MaxLength(5)
  countryCode!: string;

  @IsOptional()
  @IsIn(['en', 'sw', 'fr'])
  language?: 'en' | 'sw' | 'fr';
}

export class LoginDto {
  // Accepts email or phone in a single field.
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsOptional()
  @IsString()
  mfaCode?: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  code!: string;
}

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  code!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
