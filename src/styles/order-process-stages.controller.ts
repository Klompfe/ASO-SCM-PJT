import { BadRequestException, Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrderProcessStagesService } from './order-process-stages.service';
import { UpsertProcessStageDto } from './dto/upsert-process-stage.dto';

@ApiTags('공정 진행현황')
@ApiBearerAuth()
@Controller('order-process-stages')
export class OrderProcessStagesController {
  constructor(private readonly stagesService: OrderProcessStagesService) {}

  @Put()
  upsert(@Body() dto: UpsertProcessStageDto) {
    return this.stagesService.upsert(dto);
  }

  @Get()
  @ApiQuery({ name: 'styleNo', required: true, example: 'MB62SLM103Z' })
  findByStyle(@Query('styleNo') styleNo: string) {
    if (!styleNo) {
      throw new BadRequestException('styleNo는 필수입니다.');
    }
    return this.stagesService.findByStyleNo(styleNo);
  }

  @Get('material-readiness')
  @ApiQuery({ name: 'styleNo', required: true, example: 'MB62SLM103Z' })
  materialReadiness(@Query('styleNo') styleNo: string) {
    if (!styleNo) {
      throw new BadRequestException('styleNo는 필수입니다.');
    }
    return this.stagesService.getMaterialReadiness(styleNo);
  }

  // PR-089: 오더관리 하위 "발주·입고·출고 현황" 서브탭용 배치 리포트.
  @Get('procurement-status')
  procurementStatus() {
    return this.stagesService.getProcurementStatusReport();
  }
}
