import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BomsService } from './boms.service';
import { UpdateBomItemDto } from './dto/update-bom-item.dto';
import { SetActiveBomDto } from './dto/set-active-bom.dto';
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

  @Patch('styles/:styleNo/active-bom')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: '스타일에서 사용할(활성) BOM 선택 — 나머지 BOM은 비활성 (MANAGER/ADMIN)' })
  setActiveBom(@Param('styleNo') styleNo: string, @Body() dto: SetActiveBomDto) {
    return this.bomsService.setActiveBom(styleNo, dto.bomId);
  }

  @Patch('items/:id')
  async updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBomItemDto,
  ) {
    return await this.bomsService.updateItem(id, dto);
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
