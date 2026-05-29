import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';

import { UsersService } from './users.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  UpdateProfileDto,
  UpdateLanguageDto,
  UpdateStatusDto,
  ListUsersQueryDto,
} from './dto/users.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser('id') id: string) {
    return this.users.getById(id);
  }

  @Patch('me')
  updateMe(@CurrentUser('id') id: string, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(id, dto);
  }

  @Patch('me/language')
  updateLanguage(@CurrentUser('id') id: string, @Body() dto: UpdateLanguageDto) {
    return this.users.updateLanguage(id, dto);
  }

  // ── Admin endpoints (spec §7.2) ──
  @Roles('admin')
  @Get()
  list(@Query() query: ListUsersQueryDto) {
    return this.users.list(query);
  }

  @Roles('admin')
  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.getById(id);
  }

  @Roles('admin')
  @Patch(':id/status')
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStatusDto) {
    return this.users.updateStatus(id, dto);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.softDelete(id);
  }
}
