import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.enum';

@Controller('work-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  // 작업지시서 발행 (ADMIN, MANAGER)
  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  create(@Body() createWorkOrderDto: CreateWorkOrderDto) {
    return this.workOrdersService.create(createWorkOrderDto);
  }

  // 전체 작업지시서 목록 조회 (전체 권한 허용)
  @Get()
  findAll() {
    return this.workOrdersService.findAll();
  }

  // 단일 작업지시서 상세 조회 (전체 권한 허용)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workOrdersService.findOne(id);
  }

  // 작업지시서 상태/생산 수량 변경 (ADMIN, MANAGER)
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  update(
    @Param('id') id: string,
    @Body() updateWorkOrderDto: UpdateWorkOrderDto,
  ) {
    return this.workOrdersService.update(id, updateWorkOrderDto);
  }
}