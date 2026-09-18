import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ImportShipmentPackingDetailsService } from './import-shipment-packing-details.service';
import { CreateImportShipmentPackingDetailsDto } from './dto/create-import-shipment-packing-details.dto';
import { UpdateImportShipmentPackingDetailDto } from './dto/update-import-shipment-packing-detail.dto';

// PR-107: 수입통관 건의 색상·사이즈별 상세내역(완제품입고증 작성의 재료가 되는 값).
@ApiTags('수입통관 상세내역 (Import Shipment Packing Details)')
@ApiBearerAuth()
@Controller('import-shipments/:importShipmentId/packing-details')
export class ImportShipmentPackingDetailsController {
  constructor(private readonly service: ImportShipmentPackingDetailsService) {}

  @Post()
  @ApiOperation({ summary: '색상/사이즈별 상세내역 여러 건 등록' })
  createMany(
    @Param('importShipmentId', ParseIntPipe) importShipmentId: number,
    @Body() dto: CreateImportShipmentPackingDetailsDto,
  ) {
    return this.service.createMany(importShipmentId, dto);
  }

  @Get()
  @ApiOperation({ summary: '상세내역 목록 조회 (입고증 작성 여부 hasReceipt 포함)' })
  findAll(@Param('importShipmentId', ParseIntPipe) importShipmentId: number) {
    return this.service.findAllByShipment(importShipmentId);
  }

  @Put(':detailId')
  @ApiOperation({ summary: '상세내역 수정' })
  update(
    @Param('importShipmentId', ParseIntPipe) importShipmentId: number,
    @Param('detailId', ParseIntPipe) detailId: number,
    @Body() dto: UpdateImportShipmentPackingDetailDto,
  ) {
    return this.service.update(importShipmentId, detailId, dto);
  }

  @Delete(':detailId')
  @ApiOperation({ summary: '상세내역 삭제 (이미 입고증에 쓰인 행은 400)' })
  remove(
    @Param('importShipmentId', ParseIntPipe) importShipmentId: number,
    @Param('detailId', ParseIntPipe) detailId: number,
  ) {
    return this.service.remove(importShipmentId, detailId);
  }
}
