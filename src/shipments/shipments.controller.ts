import { Controller, Get } from '@nestjs/common';

@Controller('shipments')
export class ShipmentsController {
  @Get()
  findAll() {
    return [];
  }
}
