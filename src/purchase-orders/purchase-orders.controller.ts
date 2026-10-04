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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderDocumentService } from './purchase-order-document.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { BulkCreatePurchaseOrdersDto } from './dto/bulk-create-purchase-orders.dto';
import { GetPurchaseOrdersFilterDto } from './dto/get-purchase-orders-filter.dto';
import { PurchaseOrder } from './entities/purchase-order.entity';

@ApiTags('Purchase Orders (구매 주문 관리)')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly poService: PurchaseOrdersService,
    private readonly documentService: PurchaseOrderDocumentService,
  ) {}

  @Post()
  @ApiOperation({ summary: '구매 주문 생성' })
  @ApiResponse({ status: 201, type: PurchaseOrder })
  create(@Body() dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    return this.poService.create(dto);
  }

  // PR-179: 일괄발주 — 미리보기에서 확인된 행들을 한 번에 생성한다(라우트 순서: 고정 경로라 ':id'보다 앞).
  @Post('bulk')
  @ApiOperation({ summary: '구매 주문 일괄 생성(트랜잭션 — 하나라도 실패하면 전부 취소)' })
  @ApiResponse({ status: 201, type: [PurchaseOrder] })
  createBulk(@Body() dto: BulkCreatePurchaseOrdersDto): Promise<PurchaseOrder[]> {
    return this.poService.createBulk(dto.orders);
  }

  @Get()
  @ApiOperation({ summary: '구매 주문 전체 목록 조회 (상태/품목/공급업체/기간 필터 지원)' })
  @ApiResponse({ status: 200, type: [PurchaseOrder] })
  findAll(@Query() filter: GetPurchaseOrdersFilterDto): Promise<PurchaseOrder[]> {
    return this.poService.findAll(filter);
  }

  // PR-178: 발주서 표준 양식(엑셀)을 base64로 내려준다 — 포장내역 템플릿(PR-169)과 같은 방식.
  // PR-180: 발주 구분 제안 — 고정 경로라 ':id'보다 앞에 둬야 한다.
  @Get('order-type-suggestion')
  @ApiOperation({ summary: '품목의 발주 구분(실발주/가발주) 제안 — 이 품목을 쓰는 활성 BOM 스타일의 계약방식 기준' })
  suggestOrderType(@Query('itemId', ParseIntPipe) itemId: number) {
    return this.poService.suggestOrderTypeForItem(itemId);
  }

  @Get(':id/document')
  @ApiOperation({ summary: '발주서 표준 양식(엑셀) 생성 — base64로 반환' })
  async document(@Param('id', ParseIntPipe) id: number) {
    const { filename, buffer } = await this.documentService.generate(id);
    return { filename, base64: buffer.toString('base64') };
  }

  @Get(':id')
  @ApiOperation({ summary: '구매 주문 상세 조회' })
  @ApiResponse({ status: 200, type: PurchaseOrder })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<PurchaseOrder> {
    return this.poService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '미입고(PENDING) 발주 수량/단가/비고 수정' })
  @ApiResponse({ status: 200, type: PurchaseOrder })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePurchaseOrderDto): Promise<PurchaseOrder> {
    return this.poService.update(id, dto);
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