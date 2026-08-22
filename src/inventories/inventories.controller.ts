import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator'; // IsMin -> Min으로 수정
import { InventoriesService } from './inventories.service';
import { Inventory } from './entities/inventory.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

class StockTransactionDto {
  @ApiProperty({ description: '수량', example: 10 })
  @IsInt()
  @Min(1) // IsMin(1) -> Min(1)으로 수정
  quantity: number;
}

@ApiTags('Inventories (재고 관리)')
@ApiBearerAuth()
@Controller('inventories')
@UseGuards(JwtAuthGuard)
export class InventoriesController {
  constructor(private readonly inventoriesService: InventoriesService) {}

  @Get()
  @ApiOperation({ summary: '전체 재고 현황 조회' })
  @ApiResponse({ status: 200, type: [Inventory] })
  findAll(): Promise<Inventory[]> {
    return this.inventoriesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '특정 재고 항목 상세 조회' })
  @ApiResponse({ status: 200, type: Inventory })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Inventory> {
    return this.inventoriesService.findOne(id);
  }

  @Post(':id/stock-in')
  @ApiOperation({ summary: '재고 입고 처리' })
  @ApiResponse({ status: 200, type: Inventory })
  stockIn(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StockTransactionDto,
  ): Promise<Inventory> {
    return this.inventoriesService.stockIn(id, dto.quantity);
  }

  @Post(':id/stock-out')
  @ApiOperation({ summary: '재고 출고 처리' })
  @ApiResponse({ status: 200, type: Inventory })
  @ApiResponse({ status: 400, description: '재고 부족 또는 잘못된 수량' })
  stockOut(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StockTransactionDto,
  ): Promise<Inventory> {
    return this.inventoriesService.stockOut(id, dto.quantity);
  }
}