import { Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MetricsService } from './metrics.service';

class SnapshotsQuery {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

@ApiTags('metrics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @ApiOperation({
    summary: 'Computed metrics + 12-month projections (baseline / upside / downside).',
  })
  bundle(@CurrentUser() user: AuthenticatedUser) {
    return this.metrics.getBundle(user.id);
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'Historical metric snapshots, optionally filtered by date range.' })
  snapshots(@CurrentUser() user: AuthenticatedUser, @Query() q: SnapshotsQuery) {
    return this.metrics.listSnapshots(user.id, { from: q.from, to: q.to });
  }

  @Post('snapshot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger a metric snapshot for today.' })
  snapshot(@CurrentUser() user: AuthenticatedUser) {
    return this.metrics.takeSnapshot(user.id);
  }
}
