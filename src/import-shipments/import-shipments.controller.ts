import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ImportShipmentsService } from './import-shipments.service';
import { CreateImportShipmentDto } from './dto/create-import-shipment.dto';
import { UpdateImportShipmentStatusDto } from './dto/update-import-shipment-status.dto';
import { UpdateImportShipmentLineDto } from './dto/update-import-shipment-line.dto';

// PR-082: 완제품 수입통관 추적(HS코드 자동조회/기록까지만 — 원부자재단가/선적일
// 계산은 이 저장소 밖의 수입통관 이메일 에이전트가 담당). export-shipments처럼
// generate()에 특별한 권한 제한이 없는 것과 동일하게, 로그인만 되어 있으면 누구나
// 등록/조회할 수 있다.
@ApiTags('수입통관 (Import Shipments)')
@ApiBearerAuth()
@Controller('import-shipments')
export class ImportShipmentsController {
  constructor(private readonly importShipmentsService: ImportShipmentsService) {}

  @Post()
  @ApiOperation({ summary: '완제품 수입통관 문서 등록(헤더+라인, HS코드 자동조회)' })
  create(@Body() dto: CreateImportShipmentDto) {
    return this.importShipmentsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '수입통관 문서 목록 조회 (MasterStyle 조인)' })
  findAll() {
    return this.importShipmentsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '수입통관 문서 상세 조회 (라인 포함)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.importShipmentsService.findOneOrFail(id);
  }

  @Put(':id/status')
  @ApiOperation({ summary: '상태 전이 (PENDING_CLEARANCE→CLEARED, 역행 불가)' })
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateImportShipmentStatusDto) {
    return this.importShipmentsService.updateStatus(id, dto.status);
  }

  @Put(':id/lines/:lineId')
  @ApiOperation({ summary: 'HS코드 수동 입력/수정 (HsCodeClassification에도 신규 등록)' })
  updateLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body() dto: UpdateImportShipmentLineDto,
  ) {
    return this.importShipmentsService.updateLineHsCode(id, lineId, dto);
  }
}
