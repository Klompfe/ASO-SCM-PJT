import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExportShipmentDefaultsService } from './export-shipment-defaults.service';
import { UpdateExportShipmentDefaultsDto } from './dto/update-export-shipment-defaults.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

// PR-079: 선적서류 헤더 기본값(회사 고정정보). 조회는 누구나(생성 폼을 미리
// 채우는 데 필요), 수정만 MANAGER/ADMIN으로 제한한다.
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
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Put()
  @ApiOperation({ summary: '선적서류 헤더 기본값 설정/수정 (MANAGER/ADMIN)' })
  update(@Body() dto: UpdateExportShipmentDefaultsDto) {
    return this.service.update(dto);
  }
}
