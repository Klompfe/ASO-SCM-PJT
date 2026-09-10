import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrderShipmentsService } from './order-shipments.service';
import { CreateOrderShipmentDto } from './dto/create-order-shipment.dto';
import { UpdateOrderShipmentDto } from './dto/update-order-shipment.dto';

@ApiTags('오더 출고')
@ApiBearerAuth()
@Controller('order-shipments')
export class OrderShipmentsController {
  constructor(private readonly shipmentsService: OrderShipmentsService) {}

  @Post()
  create(@Body() dto: CreateOrderShipmentDto) {
    return this.shipmentsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrderShipmentDto) {
    return this.shipmentsService.update(id, dto);
  }

  @Get()
  @ApiQuery({ name: 'styleNo', required: true, example: 'MB62SLM103Z' })
  findByStyle(@Query('styleNo') styleNo: string) {
    if (!styleNo) {
      throw new BadRequestException('styleNo는 필수입니다.');
    }
    return this.shipmentsService.findByStyleNo(styleNo);
  }
}
