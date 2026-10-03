import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { GetPurchaseOrdersFilterDto } from './dto/get-purchase-orders-filter.dto';
import { PurchaseOrder } from './entities/purchase-order.entity';

@ApiTags('Purchase Orders (구매 주문 관리)')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly poService: PurchaseOrdersService) {}

  @Post()
  @ApiOperation({ summary: '구매 주문 생성' })
  @ApiResponse({ status: 201, type: PurchaseOrder })
  create(@Body() dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    return this.poService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '구매 주문 전체 목록 조회 (상태/품목/공급업체/기간 필터 지원)' })
  @ApiResponse({ status: 200, type: [PurchaseOrder] })
  findAll(@Query() filter: GetPurchaseOrdersFilterDto): Promise<PurchaseOrder[]> {
    return this.poService.findAll(filter);
  }

  // PR-173: 고정 경로라 ':id'보다 먼저 선언해야 한다(안 그러면 ':id'가 "material-context"를
  // id로 먼저 가로채 ParseIntPipe에서 400이 난다 — boms.controller.ts의 'duplicates'와 동일한 이유).
  @Get('material-context')
  @ApiOperation({ summary: '발주 생성 폼용 — 품목이 연결된 스타일의 생산유형(CMT/FOB) 조회(BOM 미연결이면 둘 다 null)' })
  @ApiQuery({ name: 'itemId', required: true, type: Number })
  getMaterialProductionContext(@Query('itemId', ParseIntPipe) itemId: number) {
    return this.poService.getMaterialProductionContext(itemId);
  }

  @Get(':id')
  @ApiOperation({ summary: '구매 주문 상세 조회' })
  @ApiResponse({ status: 200, type: PurchaseOrder })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<PurchaseOrder> {
    return this.poService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '구매 주문 상태 변경' })
  @ApiResponse({ status: 200, type: PurchaseOrder })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseOrderStatusDto,
  ): Promise<PurchaseOrder> {
    return this.poService.updateStatus(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '구매 주문 삭제' })
  @ApiResponse({ status: 200 })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.poService.remove(id);
  }
}