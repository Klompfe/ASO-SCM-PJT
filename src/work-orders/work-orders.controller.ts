import { Controller, Post, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('work-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @Post()
  @ApiOperation({ summary: '작업 지시서 생성' })
  create(@Body() createWorkOrderDto: CreateWorkOrderDto) {
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
  @ApiBody({ type: UpdateWorkOrderDto }) // Swagger에 Request Body를 명시적으로 표시
  update(
    @Param('id') id: string,
    @Body() updateWorkOrderDto: UpdateWorkOrderDto, // @Body() 데코레이터 확인
  ) {
    return this.workOrdersService.update(id, updateWorkOrderDto);
  }
}