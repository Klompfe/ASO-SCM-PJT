import { BadRequestException, Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BomsService } from './boms.service';

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
}
