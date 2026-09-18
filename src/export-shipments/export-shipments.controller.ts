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
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ExportShipmentsService } from './export-shipments.service';
import { GenerateExportShipmentDto } from './dto/generate-export-shipment.dto';
import { FindExportShipmentsDto } from './dto/find-export-shipments.dto';
import { UpdateExportShipmentStatusDto } from './dto/update-export-shipment-status.dto';
import { UpdateExportShipmentLineDto } from './dto/update-export-shipment-line.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';

// PR-075: PackingReceipt(PR-074)+BomItem.composition/hsCode(PR-073)를 합쳐
// INVOICE/Packing List에 쓸 ExportShipment(+라인)를 자동 생성/관리한다.
@ApiTags('수출선적서류 (Export Shipments)')
@ApiBearerAuth()
@Controller('export-shipments')
export class ExportShipmentsController {
  constructor(private readonly exportShipmentsService: ExportShipmentsService) {}

  @Post('generate')
  @ApiOperation({ summary: '발주(들)의 포장내역을 집계해 수출선적서류 초안(DRAFT) 생성' })
  @ApiQuery({ name: 'purchaseOrderIds', example: '1,2,3', description: '콤마로 구분된 발주 ID 목록' })
  generate(@Query('purchaseOrderIds') purchaseOrderIdsRaw: string, @Body() dto: GenerateExportShipmentDto) {
    if (!purchaseOrderIdsRaw) {
      throw new BadRequestException('purchaseOrderIds 쿼리 파라미터가 필요합니다.');
    }
    const purchaseOrderIds = purchaseOrderIdsRaw
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v !== '')
      .map((v) => {
        const n = Number(v);
        if (isNaN(n)) throw new BadRequestException(`purchaseOrderIds에 유효하지 않은 값이 있습니다: ${v}`);
        return n;
      });
    return this.exportShipmentsService.generate(purchaseOrderIds, dto);
  }

  @Post('import-from-file')
  @ApiOperation({ summary: '기 작성된 INVOICE/Packing List 엑셀을 그대로 가져와 DRAFT로 즉시 등록' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  importFromFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('업로드할 엑셀 파일이 없습니다.');
    }
    return this.exportShipmentsService.importFromFile(file.buffer);
  }

  @Get()
  @ApiOperation({ summary: '수출선적서류 목록 조회 (스타일번호/자재명/선적건번호 검색)' })
  findAll(@Query() query: FindExportShipmentsDto) {
    return this.exportShipmentsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '수출선적서류 상세 조회 (라인 포함)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.exportShipmentsService.findOneOrFail(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '상태 전이 (DRAFT→REVIEWED→FINALIZED, 역행 불가)' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExportShipmentStatusDto,
    @GetUser() user: any,
  ) {
    return this.exportShipmentsService.updateStatus(id, dto.status, user.role);
  }

  @Patch(':id/lines/:lineId')
  @ApiOperation({ summary: '라인 단가(unitPrice) 입력/수정 — amount는 서버에서 자동 계산' })
  updateLine(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineId', ParseIntPipe) lineId: number,
    @Body() dto: UpdateExportShipmentLineDto,
  ) {
    return this.exportShipmentsService.updateLineUnitPrice(id, lineId, dto);
  }
}
