import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
import { PurchaseOrderStatus } from './entities/purchase-order.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard)
export class PurchaseOrdersController {
  constructor(private readonly poService: PurchaseOrdersService) {}

  @Post()
  create(@Body() createDto: CreatePurchaseOrderDto) {
    return this.poService.create(createDto);
  }

  @Get()
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: PurchaseOrderStatus,
  ) {
    return this.poService.findAll({ page, limit, status });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.poService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdatePurchaseOrderStatusDto,
  ) {
    return this.poService.updateStatus(id, updateDto.status);
  }

  @Patch(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.poService.cancel(id);
  }
}