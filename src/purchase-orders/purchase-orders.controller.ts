import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Purchase Orders (구매 주문 관리)')
@ApiBearerAuth()
@Controller('purchase-orders')
@UseGuards(JwtAuthGuard)
export class PurchaseOrdersController {
  constructor(private readonly poService: PurchaseOrdersService) {}

  @Post()
  @ApiOperation({ summary: '구매 주문 생성' })
  @ApiResponse({ status: 201, type: PurchaseOrder })
  create(@Body() dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    return this.poService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '구매 주문 전체 목록 조회' })
  @ApiResponse({ status: 200, type: [PurchaseOrder] })
  findAll(): Promise<PurchaseOrder[]> {
    return this.poService.findAll();
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