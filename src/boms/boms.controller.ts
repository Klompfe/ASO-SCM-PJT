import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BomsService } from './boms.service';
import { UpdateBomItemDto } from './dto/update-bom-item.dto';
import { SwapBomItemMaterialDto } from './dto/swap-bom-item-material.dto';
import { RenameBomItemMaterialDto } from './dto/rename-bom-item-material.dto';
import { SetActiveBomDto } from './dto/set-active-bom.dto';
import { OuterFabricAuditQueryDto } from './dto/outer-fabric-audit-query.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('자재명세(BOM)')
@ApiBearerAuth()
@Controller('boms')
export class BomsController {
  constructor(private readonly bomsService: BomsService) {}

  @Get()
  @ApiQuery({ name: 'styleNo', required: true, example: 'MB62SLM103Z' })
  async findByStyle(@Query('styleNo') styleNo: string) {
    if (!styleNo) {
      throw new BadRequestException('styleNo는 필수입니다.');
    }
    const bom = await this.bomsService.findActiveByStyleNo(styleNo);
    if (!bom) {
      throw new NotFoundException(`등록된 자재명세가 없습니다: ${styleNo}`);
    }
    return bom;
  }

  // PR-073: 자재명세 상세 테이블에서 혼용율/HS코드 인라인 수정.
  // PR-121: 고정 경로라 다른 동적 경로보다 앞에 둔다.
  @Get('duplicates')
  @ApiOperation({ summary: 'BOM 중복 검토 — BOM이 2건 이상인 스타일을 나란히 비교(확인 필요한 것 먼저)' })
  findDuplicates() {
    return this.bomsService.findDuplicateReview();
  }

  // PR-256: 겉감 혼용률 점검 목록(읽기 전용 GET) — 고정 경로라 다른 경로보다 앞에 둔다. 권한은 기존 BOM 조회와 같다(로그인).
  @Get('outer-fabric-audit')
  @ApiOperation({ summary: '겉감 혼용률 점검 — 겉감 행이 없거나 겉감 혼용률이 비어 있는 스타일 목록(읽기 전용)' })
  findOuterFabricAudit(@Query() query: OuterFabricAuditQueryDto) {
    return this.bomsService.findOuterFabricAudit(query);
  }

  @Patch('styles/:styleNo/active-bom')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: '스타일에서 사용할(활성) BOM 선택 — 나머지 BOM은 비활성 (MANAGER/ADMIN)' })
  setActiveBom(@Param('styleNo') styleNo: string, @Body() dto: SetActiveBomDto) {
    return this.bomsService.setActiveBom(styleNo, dto.bomId);
  }

  @Patch('items/:id')
  @ApiOperation({ summary: '자재명세 항목 인라인 수정 — 혼용율/HS코드/실·테이프 종류/요척/규격/색상/구분' })
  async updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBomItemDto,
  ) {
    return await this.bomsService.updateItem(id, dto);
  }

  // PR-197: 저장된 BOM 행 삭제 — 이 스타일 BOM에서만 빠진다(자재 마스터/발주는 유지).
  @Delete('items/:id')
  @ApiOperation({ summary: '자재명세 항목 삭제 — 자재 마스터와 기존 발주는 그대로 둠' })
  async deleteItem(@Param('id', ParseIntPipe) id: number) {
    return await this.bomsService.deleteItem(id);
  }

  // PR-197: 이 BOM 행이 가리키는 자재를 이미 있는 다른 자재로 바꾼다(새 자재는 만들지 않음).
  @Patch('items/:id/material')
  @ApiOperation({ summary: '자재명세 항목의 자재를 이미 등록된 다른 자재로 교체(이름 오인식 교정용)' })
  async swapMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SwapBomItemMaterialDto,
  ) {
    return await this.bomsService.swapMaterial(id, dto);
  }

  // PR-241: "이 행만" 자재명 변경 — 자재 교체와 달리 새 이름을 받아 서버가 기존
  // 자재에 연결하거나 새로 만든다(안전장치는 서비스 쪽에서 강제).
  @Patch('items/:id/material-name')
  @ApiOperation({ summary: '자재명세 항목(이 행만)의 자재명 변경 — 기존 자재에 연결되거나 새 자재가 생성됨' })
  async renameMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenameBomItemMaterialDto,
  ) {
    return await this.bomsService.renameMaterial(id, dto);
  }

  // PR-099: "라벨류 기본 세트 추가" — 이미 있는 항목은 건너뛰고 없는 것만 추가한다.
  @Post('label-set')
  @ApiQuery({ name: 'styleNo', required: true, example: 'MB62SLM103Z' })
  async addLabelSet(@Query('styleNo') styleNo: string) {
    if (!styleNo) {
      throw new BadRequestException('styleNo는 필수입니다.');
    }
    return await this.bomsService.addLabelSet(styleNo);
  }
}
