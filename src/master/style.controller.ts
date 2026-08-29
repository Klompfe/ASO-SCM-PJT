import { Controller, Get, Query } from '@nestjs/common';
import { StyleService } from './services/style.service';

@Controller('styles')
export class StyleController {
  constructor(private readonly service: StyleService) {}

  @Get()
  async findAll(@Query() filter: any) {
    return await this.service.findAll(filter);
  }
}
