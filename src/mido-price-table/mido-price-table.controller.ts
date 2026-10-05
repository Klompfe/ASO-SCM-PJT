import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MidoPriceTableService } from './mido-price-table.service';
import { FindMidoPriceCandidatesDto } from './dto/find-mido-price-candidates.dto';

@ApiTags('미도 단가표 (Mido Price Table)')
@ApiBearerAuth()
@Controller('mido-price-table')
export class MidoPriceTableController {
  constructor(private readonly service: MidoPriceTableService) {}

  @Get()
  @ApiOperation({ summary: '단가표 전체 목록' })
  findAll() {
    return this.service.findAll();
  }

  @Get('candidates')
  @ApiOperation({ summary: '자재명으로 단가표 후보 검색(부분일치, 자동 확정 없음). lineUnit이 콘/롤이면 환산 후보(conversion)도 함께 반환' })
  findCandidates(@Query() query: FindMidoPriceCandidatesDto) {
    return this.service.findCandidates(query.materialName, {
      lineUnit: query.lineUnit,
      materialSubType: query.materialSubType,
    });
  }
}
