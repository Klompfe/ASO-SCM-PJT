import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { InventoriesService } from './inventories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Inventories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inventories')
export class InventoriesController {
  constructor(private readonly inventoriesService: InventoriesService) {}

  @Get()
  @ApiOperation({ summary: '전체 재고 목록 조회' })
  @ApiResponse({ status: 200, description: '조회 성공' })
  findAll() {
    return this.inventoriesService.findAll();
  }

  @Get('item/:itemId')
  @ApiOperation({ summary: '특정 품목의 재고 조회' })
  @ApiResponse({ status: 200, description: '조회 성공' })
  getByItemId(@Param('itemId', ParseIntPipe) itemId: number) {
    return this.inventoriesService.getByItemId(itemId);
  }
}