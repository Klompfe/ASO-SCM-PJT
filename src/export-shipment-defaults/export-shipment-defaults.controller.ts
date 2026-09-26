import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExportShipmentDefaultsService } from './export-shipment-defaults.service';
import { UpdateExportShipmentDefaultsDto } from './dto/update-export-shipment-defaults.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AuditLog } from '../audit-log/audit-log.decorator';

// PR-079: 선적서류 헤더 기본값(회사 고정정보). 조회는 누구나(생성 폼을 미리
// 채우는 데 필요), 수정만 ADMIN/MASTER으로 제한한다.
@ApiTags('선적서류 기본정보 (Export Shipment Defaults)')
@ApiBearerAuth()
@Controller('export-shipment-defaults')
export class ExportShipmentDefaultsController {
  constructor(private readonly service: ExportShipmentDefaultsService) {}

  @Get()
  @ApiOperation({ summary: '선적서류 헤더 기본값 조회 (미설정 시 null)' })
  find() {
    return this.service.find();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MASTER)
  // 파라미터 없는 싱글턴 설정이라(행을 하나로 특정할 라우트 파라미터가 없음)
  // beforeValue 자동 조회는 생략한다.
  @AuditLog({ entityType: 'ExportShipmentDefaults' })
  @Put()
  @ApiOperation({ summary: '선적서류 헤더 기본값 설정/수정 (ADMIN/MASTER)' })
  update(@Body() dto: UpdateExportShipmentDefaultsDto) {
    return this.service.update(dto);
  }
}
