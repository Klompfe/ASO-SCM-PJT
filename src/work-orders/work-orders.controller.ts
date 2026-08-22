import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderStatusDto } from './dto/update-work-order-status.dto';
import { GetWorkOrdersFilterDto } from './dto/get-work-orders-filter.dto';

@ApiTags('Work Orders (작업 지시 관리)')
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Post()
  @ApiOperation({ summary: '작업 지시 생성' })
  create(@Body() createWorkOrderDto: CreateWorkOrderDto) {
    return this.workOrdersService.create({
      itemId: createWorkOrderDto.itemId,
      targetQuantity: createWorkOrderDto.quantity,
    });
  }

  @Get()
  @ApiOperation({ summary: '작업 지시 목록 조회 (페이징 & 검색 필터)' })
  findAll(@Query() filterDto: GetWorkOrdersFilterDto) {
    return this.workOrdersService.findAll(filterDto);
  }

  @Get(':id')
  @ApiOperation({ summary: '단건 작업 지시 상세 조회' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.workOrdersService.findOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: '작업 지시 상태 변경 (COMPLETED 시 원자재 차감 및 완제품 증대)',
  })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateWorkOrderStatusDto: UpdateWorkOrderStatusDto,
  ) {
    return this.workOrdersService.updateStatus(id, updateWorkOrderStatusDto.status);
  }
}