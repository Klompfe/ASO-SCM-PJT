import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BomsService } from './boms.service';
import { UpdateBomItemDto } from './dto/update-bom-item.dto';

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
    const bom = await this.bomsService.findLatestByStyleNo(styleNo);
    if (!bom) {
      throw new NotFoundException(`등록된 자재명세가 없습니다: ${styleNo}`);
    }
    return bom;
  }

  // PR-073: 자재명세 상세 테이블에서 혼용율/HS코드 인라인 수정.
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
