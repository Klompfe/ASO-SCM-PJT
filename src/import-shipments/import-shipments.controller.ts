import 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ImportShipmentsService } from './import-shipments.service';
import { CreateImportShipmentDto } from './dto/create-import-shipment.dto';
import { UpdateImportShipmentStatusDto } from './dto/update-import-shipment-status.dto';
import { UpdateImportShipmentLineDto } from './dto/update-import-shipment-line.dto';
import { FindImportShipmentsDto } from './dto/find-import-shipments.dto';
import { UpdateImportShipmentHeaderDto } from './dto/update-import-shipment-header.dto';
import { BulkClearImportShipmentsDto } from './dto/bulk-clear-import-shipments.dto';

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

  @Post('import-from-file')
  @ApiOperation({ summary: 'Vietnam INVOICE/Packing List 엑셀을 업로드해 스타일별로 수입통관 문서 자동 생성' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  importFromFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('업로드할 엑셀 파일이 없습니다.');
    }
    return this.importShipmentsService.importFromFile(file.buffer);
  }

  @Get()
  @ApiOperation({ summary: '수입통관 문서 목록 조회 (MasterStyle 조인, 스타일번호/자재명/선적건번호 검색)' })
  findAll(@Query() query: FindImportShipmentsDto) {
    return this.importShipmentsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '수입통관 문서 상세 조회 (라인 포함)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.importShipmentsService.findOneOrFail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '선적 일정/경로(POL/POD/ETD/ETA/선명) 수정 — 보내지 않은 필드는 유지, null은 지움' })
  updateHeader(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateImportShipmentHeaderDto) {
    return this.importShipmentsService.updateHeader(id, dto);
  }

  @Put(':id/status')
  @ApiOperation({ summary: '상태 전이 (PENDING_CLEARANCE→CLEARED, 역행 불가)' })
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateImportShipmentStatusDto) {
    return this.importShipmentsService.updateStatus(id, dto.status);
  }

  // PR-152: INV/PKL(invoiceNo) 단위 일괄 통관완료처리 — 건별 PUT :id/status는 그대로 둔다.
  @Post('bulk-clear')
  @ApiOperation({ summary: '통관완료 일괄처리 — invoiceNo(권장) 또는 ids로 PENDING_CLEARANCE 건을 전부 CLEARED로 전환, 이미 완료된 건은 건너뜀' })
  bulkClear(@Body() dto: BulkClearImportShipmentsDto) {
    return this.importShipmentsService.bulkClear(dto);
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
