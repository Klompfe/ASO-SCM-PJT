import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiBody } from '@nestjs/swagger';
import { ItemsService } from './items.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('items')
@ApiBearerAuth()
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'ITEM-002' },
        name: { type: 'string', example: '원사 B' },
        type: { type: 'string', example: 'RAW_MATERIAL' },
      },
    },
  })
  create(@Body() createItemDto: any) {
    return this.itemsService.create(createItemDto);
  }
}