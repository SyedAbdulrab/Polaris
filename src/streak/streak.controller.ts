import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateStreakDto } from './dto/create-streak.dto';
import { UpdateStreakDto } from './dto/update-streak.dto';
import { StreakService } from './streak.service';

@ApiTags('streaks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('streaks')
export class StreakController {
  constructor(private readonly streaks: StreakService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.streaks.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStreakDto) {
    return this.streaks.create(user.id, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.streaks.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateStreakDto,
  ) {
    return this.streaks.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.streaks.remove(user.id, id);
  }

  @Post(':id/log')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log today against this streak (consecutive-day aware).' })
  log(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.streaks.logToday(user.id, id);
  }

  @Post(':id/break')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually break the streak (resets currentCount to 0).' })
  break_(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.streaks.breakStreak(user.id, id);
  }
}
