import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MaterialPackagingUnitRulesService } from './material-packaging-unit-rules.service';
import { CreateMaterialPackagingUnitRuleDto } from './dto/create-material-packaging-unit-rule.dto';
import { UpdateMaterialPackagingUnitRuleDto } from './dto/update-material-packaging-unit-rule.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

// PR-203: 조회는 누구나(ItemsManager/다중 스타일 발주/실·테이프 분류 화면이 읽음),
// 등록·수정·삭제만 MANAGER/ADMIN으로 제한한다 — export-shipment-defaults.controller.ts와
// 동일한 원칙.
@ApiTags('자재 포장단위 규칙 (마스터·설정)')
@ApiBearerAuth()
@Controller('material-packaging-unit-rules')
export class MaterialPackagingUnitRulesController {
  constructor(private readonly service: MaterialPackagingUnitRulesService) {}

  @Get()
  @ApiOperation({ summary: '자재 포장단위 규칙 목록 조회' })
  findAll() {
    return this.service.findAll();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Post()
  @ApiOperation({ summary: '자재 포장단위 규칙 등록 (MANAGER/ADMIN)' })
  create(@Body() dto: CreateMaterialPackagingUnitRuleDto) {
    return this.service.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: '자재 포장단위 규칙 수정 (MANAGER/ADMIN)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMaterialPackagingUnitRuleDto) {
    return this.service.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: '자재 포장단위 규칙 삭제 (MANAGER/ADMIN)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
