import { BadRequestException, Controller, Get, Post, Body, Query } from '@nestjs/common';
import { MappingCommitService } from '../services/mapping-commit.service';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CommitMappingDto } from '../dto/commit-mapping.dto';
import { BomDiffRequestDto } from '../dto/bom-diff.dto';
import { BomReconcileRequestDto } from '../dto/bom-reconcile.dto';

@ApiTags('데이터 매핑 커밋 API')
@Controller('mapping')
export class MappingCommitController {
  constructor(private readonly mappingCommitService: MappingCommitService) {}

  @ApiOperation({ summary: '해당 styleNo가 이미 등록(승인)되어 있는지 확인' })
  @ApiQuery({ name: 'styleNo', required: true, example: 'MB62SLM103Z' })
  @Get('check-exists')
  async checkExists(@Query('styleNo') styleNo: string) {
    if (!styleNo) throw new BadRequestException('styleNo는 필수입니다.');
    return await this.mappingCommitService.checkExists(styleNo);
  }

  @ApiOperation({ summary: '최종 매핑 데이터 저장' })
  @Post('commit')
  async commit(@Body() payload: CommitMappingDto) {
    return await this.mappingCommitService.commit(payload);
  }

  // PR-198: 저장 전 "기존 BOM과 비교"(읽기 전용, 저장 안 함) — 화면이 저장 버튼을 누르면
  // 먼저 이걸 호출해 비교 화면을 보여줄지 결정한다.
  @ApiOperation({ summary: '자재명세 엑셀을 기존 BOM과 비교(저장하지 않음)' })
  @Post('bom-diff')
  async bomDiff(@Body() payload: BomDiffRequestDto) {
    return await this.mappingCommitService.diff(payload);
  }

  // PR-198: 비교 화면에서 사람이 고른 행별 동작(덮어쓰기/추가/제거/교체)을 적용한다.
  @ApiOperation({ summary: '비교 화면에서 고른 행별 동작을 BOM에 적용' })
  @Post('bom-reconcile')
  async bomReconcile(@Body() payload: BomReconcileRequestDto) {
    return await this.mappingCommitService.reconcile(payload);
  }
}
