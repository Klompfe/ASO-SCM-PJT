import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PackingReceiptsService } from './packing-receipts.service';
import { FindPackingReceiptsDto } from './dto/find-packing-receipts.dto';

// PR-118: 발주 단위(/purchase-orders/:id/packing-receipts)가 아니라 발주 전체를 가로질러 조회하는
// 집계 보고서용 경로. 카톤 단위 상세를 그대로 내려주고 집계는 화면에서 한다.
@ApiTags('포장내역 (Packing Receipts)')
@ApiBearerAuth()
@Controller('packing-receipts')
export class PackingReceiptsReportController {
  constructor(private readonly packingReceiptsService: PackingReceiptsService) {}

  @Get()
  @ApiOperation({ summary: '부자재(카톤) 포장내역 전체 조회 — 입고일 기간(from/to) 필터, 발주/공급업체/품목 포함' })
  findAll(@Query() filter: FindPackingReceiptsDto) {
    return this.packingReceiptsService.findAllForReport(filter);
  }
}
