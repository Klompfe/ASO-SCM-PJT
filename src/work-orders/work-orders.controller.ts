import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderStatusDto } from './dto/update-work-order-status.dto';
import { WorkOrder } from './entities/work-order.entity';
import { GetWorkOrdersFilterDto } from './dto/get-work-orders-filter.dto';

@ApiTags('Work Orders (작업 지시 관리)')
@ApiBearerAuth()
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly woService: WorkOrdersService) {}

  @Get('style-requirements')
  @ApiOperation({ summary: '스타일+수량 기준 자재 필요량/이미 발주/부족 계산(작업지시 없이) — 발주 화면용. quantity 생략 시 스타일 총 수량' })
  @ApiQuery({ name: 'styleNo', required: true, example: 'MB62SLM103Z' })
  @ApiQuery({ name: 'quantity', required: false, example: 1000 })
  getStyleRequirements(@Query('styleNo') styleNo: string, @Query('quantity') quantity?: string) {
    if (!styleNo) {
      throw new BadRequestException('styleNo는 필수입니다.');
    }
    if (quantity !== undefined && quantity !== '' && !(Number(quantity) > 0)) {
      throw new BadRequestException('quantity는 0보다 큰 숫자여야 합니다.');
    }
    return this.woService.getStyleRequirements(styleNo, quantity ? Number(quantity) : undefined);
  }

  @Post()
  @ApiOperation({ summary: '작업 지시 생성' })
  @ApiResponse({ status: 201, type: WorkOrder })
  create(@Body() dto: CreateWorkOrderDto): Promise<WorkOrder> {
    return this.woService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '작업 지시 전체 목록 조회 (페이징 & 필터)' })
  @ApiResponse({ status: 200 })
  findAll(@Query() filter: GetWorkOrdersFilterDto) {
    return this.woService.findAll(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: '작업 지시 상세 조회' })
  @ApiResponse({ status: 200, type: WorkOrder })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<WorkOrder> {
    return this.woService.findOne(id);
  }

  @Get(':id/material-requirements')
  @ApiOperation({ summary: 'BOM 소요명세서 — 작업지시 물량 기준 자재별 필요 총수량/이미 발주 수량/부족 수량' })
  @ApiResponse({ status: 200 })
  getMaterialRequirements(@Param('id', ParseIntPipe) id: number) {
    return this.woService.getMaterialRequirements(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '작업 지시 상태 변경' })
  @ApiResponse({ status: 200, type: WorkOrder })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkOrderStatusDto,
  ): Promise<WorkOrder> {
    return this.woService.updateStatus(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '작업 지시 삭제' })
  @ApiResponse({ status: 200 })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.woService.remove(id);
  }
}
