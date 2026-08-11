import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { WorkOrdersService } from './work-orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('work-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Post()
  @ApiOperation({ summary: '작업 지시서 생성' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        itemId: { type: 'number', example: 2 },
        quantity: { type: 'number', example: 10 },
      },
    },
  })
  create(@Body() createWorkOrderDto: any) {
    return this.workOrdersService.create(createWorkOrderDto);
  }

  @Get()
  @ApiOperation({ summary: '작업 지시서 전체 목록 조회' })
  findAll() {
    return this.workOrdersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '작업 지시서 단일 상세 조회' })
  findOne(@Param('id') id: string) {
    return this.workOrdersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '작업 지시서 정보/상태 수정' })
  update(@Param('id') id: string, @Body() updateWorkOrderDto: any) {
    return this.workOrdersService.update(id, updateWorkOrderDto);
  }
}