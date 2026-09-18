import { Controller, Get, Post, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { GoodsReceiptsService } from './goods-receipts.service';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';

@ApiTags('완제품입고증 (Goods Receipts)')
@ApiBearerAuth()
@Controller('goods-receipts')
export class GoodsReceiptsController {
  constructor(private readonly goodsReceiptsService: GoodsReceiptsService) {}

  @Post()
  @ApiOperation({ summary: '완제품입고증 작성 (선택된 상세내역 라인을 복사해 생성)' })
  create(@Body() dto: CreateGoodsReceiptDto) {
    return this.goodsReceiptsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '완제품입고증 목록 조회' })
  @ApiQuery({ name: 'importShipmentId', required: false })
  findAll(@Query('importShipmentId') importShipmentId?: string) {
    return this.goodsReceiptsService.findAll(importShipmentId ? Number(importShipmentId) : undefined);
  }

  @Get(':id')
  @ApiOperation({ summary: '완제품입고증 상세 조회' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.goodsReceiptsService.findOneOrFail(id);
  }
}
