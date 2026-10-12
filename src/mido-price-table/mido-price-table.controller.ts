import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MidoPriceTableService } from './mido-price-table.service';
import { FindMidoPriceCandidatesDto } from './dto/find-mido-price-candidates.dto';
import { CreateMidoPriceItemDto } from './dto/create-mido-price-item.dto';
import { UpdateMidoPriceItemDto } from './dto/update-mido-price-item.dto';
import { ImportMidoPricePreviewDto } from './dto/import-mido-price-preview.dto';
import { ImportMidoPriceApplyDto } from './dto/import-mido-price-apply.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('미도 단가표 (Mido Price Table)')
@ApiBearerAuth()
@Controller('mido-price-table')
export class MidoPriceTableController {
  constructor(private readonly service: MidoPriceTableService) {}

  // PR-188: 관리 화면은 ?includeInactive=true로 중지된 행도 본다. 기본(후보 검색 등
  // 다른 화면이 재사용할 수도 있는 기본 호출)은 사용 중인 행만.
  @Get()
  @ApiOperation({ summary: '단가표 목록 조회(기본: 사용 중인 행만, includeInactive=true면 전체)' })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.service.findAll(includeInactive === 'true');
  }

  @Get('candidates')
  @ApiOperation({ summary: '자재명으로 단가표 후보 검색(부분일치, 자동 확정 없음). lineUnit이 콘/롤이면 환산 후보(conversion)도 함께 반환' })
  findCandidates(@Query() query: FindMidoPriceCandidatesDto) {
    return this.service.findCandidates(query.materialName, {
      lineUnit: query.lineUnit,
      materialSubType: query.materialSubType,
    });
  }

  // PR-188: 가격 값은 추측/자동 확정 없이 사람이 직접 등록·수정한다(안전 원칙).
  // 쓰기 작업이므로 MANAGER/ADMIN만 허용.
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Post()
  @ApiOperation({ summary: '단가표 항목 등록(MANAGER/ADMIN)' })
  create(@Body() dto: CreateMidoPriceItemDto) {
    return this.service.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: '단가표 항목 수정/사용 중지·재사용(MANAGER/ADMIN). 삭제 API는 없음(실수 방지) — isActive로 중지한다.' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMidoPriceItemDto) {
    return this.service.update(id, dto);
  }

  // PR-188: 일괄 등록 1단계 — DB에 쓰지 않고 신규/변경/동일/오류만 분류해 보여준다.
  // 조회성 작업이라 권한 제한 없음(등록은 import/apply에서만 MANAGER/ADMIN 확인).
  @Post('import/preview')
  @ApiOperation({ summary: '단가표 CSV 일괄 등록 미리보기(DB에 쓰지 않음)' })
  importPreview(@Body() dto: ImportMidoPricePreviewDto) {
    return this.service.importPreview(dto.csv);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Post('import/apply')
  @ApiOperation({ summary: '단가표 CSV 일괄 등록 적용(사람이 확인한 행만, all-or-nothing, MANAGER/ADMIN)' })
  importApply(@Body() dto: ImportMidoPriceApplyDto) {
    return this.service.importApply(dto.rows);
  }
}
