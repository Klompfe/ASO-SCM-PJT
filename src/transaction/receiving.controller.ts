import { Controller, Get, Query } from '@nestjs/common';
import { ReceivingService } from './services/receiving.service';

@Controller('receivings')
export class ReceivingController {
  constructor(private readonly service: ReceivingService) {}

  @Get()
  async findAll(@Query('batch') batch?: string, @Query('onlyPending') onlyPending?: string) {
    return await this.service.findAll({ batch, onlyPending: onlyPending === 'true' });
  }
}
