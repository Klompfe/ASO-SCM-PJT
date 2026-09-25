import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StatusCodesService } from './status-codes.service';
import { CreateStatusCodeDto } from './dto/create-status-code.dto';
import { UpdateStatusCodeDto } from './dto/update-status-code.dto';
import { GetStatusCodesFilterDto } from './dto/get-status-codes-filter.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AuditLog } from '../audit-log/audit-log.decorator';

@ApiTags('상태코드 관리 (마스터·설정)')
@ApiBearerAuth()
@Controller('status-codes')
export class StatusCodesController {
  constructor(private readonly service: StatusCodesService) {}

  @Get()
  @ApiOperation({ summary: '도메인별 상태코드 목록 조회(기본은 활성만, 정렬순) — 필터 드롭다운이 씀' })
  findAll(@Query() filter: GetStatusCodesFilterDto) {
    return this.service.findAll(filter.domain, filter.includeInactive === 'true');
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditLog({ entityType: 'StatusCode' })
  @ApiOperation({ summary: '상태코드 등록 (MANAGER/ADMIN)' })
  create(@Body() dto: CreateStatusCodeDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditLog({ entityType: 'StatusCode', table: 'status_codes', pkColumn: 'id' })
  @ApiOperation({ summary: '상태코드 수정 — 라벨/정렬순서/활성여부만(도메인·코드값은 불변) (MANAGER/ADMIN)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStatusCodeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @AuditLog({ entityType: 'StatusCode', table: 'status_codes', pkColumn: 'id' })
  @ApiOperation({ summary: '상태코드 삭제 — 사용 중이면 막힘(대신 비활성화 권장) (MANAGER/ADMIN)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
