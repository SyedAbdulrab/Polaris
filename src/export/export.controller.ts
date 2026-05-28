import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CsvType, ExportService } from './export.service';

const VALID_CSV_TYPES: ReadonlySet<string> = new Set([
  'income',
  'expenses',
  'goals',
  'streaks',
  'logs',
  'snapshots',
]);

@ApiTags('export')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('json')
  @ApiOperation({ summary: 'Export everything as JSON.' })
  json(@CurrentUser() user: AuthenticatedUser) {
    return this.exportService.fullJson(user.id);
  }

  @Get('csv/:type')
  @ApiOperation({
    summary:
      'Export one entity type as CSV. type ∈ income | expenses | goals | streaks | logs | snapshots.',
  })
  async csv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('type') type: string,
    @Res() res: Response,
  ) {
    if (!VALID_CSV_TYPES.has(type)) {
      throw new BadRequestException(`Unknown CSV type: ${type}`);
    }
    const csv = await this.exportService.csv(user.id, type as CsvType);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="polaris-${type}.csv"`);
    res.send(csv);
  }

  @Get('pdf/monthly')
  @Header('Content-Type', 'application/pdf')
  @ApiOperation({
    summary: 'Monthly summary PDF. Defaults to the current month if year/month omitted.',
  })
  async pdf(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
    @Query('year') yearStr?: string,
    @Query('month') monthStr?: string,
  ) {
    const now = new Date();
    const year = yearStr ? Number(yearStr) : now.getUTCFullYear();
    const month = monthStr ? Number(monthStr) : now.getUTCMonth() + 1;
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('Invalid year/month');
    }
    const buf = await this.exportService.monthlySummaryPdf(user.id, year, month);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="polaris-${year}-${String(month).padStart(2, '0')}.pdf"`,
    );
    res.send(buf);
  }
}
