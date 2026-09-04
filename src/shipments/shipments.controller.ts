import { Controller, Get, Post, Body, Param, Patch, Delete, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ShipmentsService } from './shipments.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { UpdateShipmentStatusDto } from './dto/update-shipment-status.dto';
import { Shipment } from './entities/shipment.entity';

@ApiTags('Shipments (출하 관리)')
@ApiBearerAuth()
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post()
  @ApiOperation({ summary: '출하 생성' })
  @ApiResponse({ status: 201, type: Shipment })
  create(@Body() dto: CreateShipmentDto): Promise<Shipment> {
    return this.shipmentsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '출하 전체 목록 조회' })
  @ApiResponse({ status: 200, type: [Shipment] })
  findAll(): Promise<Shipment[]> {
    return this.shipmentsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '출하 상세 조회' })
  @ApiResponse({ status: 200, type: Shipment })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Shipment> {
    return this.shipmentsService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '출하 상태 변경 (SHIPPING -> DELIVERED)' })
  @ApiResponse({ status: 200, type: Shipment })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateShipmentStatusDto,
  ): Promise<Shipment> {
    return this.shipmentsService.updateStatus(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '출하 삭제' })
  @ApiResponse({ status: 200 })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.shipmentsService.remove(id);
  }
}
