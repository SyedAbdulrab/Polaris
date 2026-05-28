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
}
