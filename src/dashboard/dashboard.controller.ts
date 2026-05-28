import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'One call → everything the frontend dashboard needs.',
    description:
      'Computed metrics, baseline/upside/downside scenarios, last 90 days of snapshots, ' +
      'streaks, recent log entries, goals, and the active income/expense lists. Cached in Redis.',
  })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.getDashboard(user.id);
  }
}
