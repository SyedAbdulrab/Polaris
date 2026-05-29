import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller({ path: '/', version: VERSION_NEUTRAL })
export class AppController {
  @Get()
  root() {
    return {
      name: 'Polaris API',
      version: '0.1.0',
      docs: '/api/docs',
      health: '/health',
    };
  }

  // TEMPORARY: throws on purpose so we can confirm Sentry is capturing errors.
  // Hit GET /api/debug-sentry once, verify the event in Sentry, then remove this.
  @Get('debug-sentry')
  debugSentry() {
    throw new Error('Polaris Sentry test error — capture is working!');
  }
}
