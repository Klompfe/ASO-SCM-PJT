import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BrandPriceRulesService } from './brand-price-rules.service';
import { CreateBrandPriceRuleDto } from './dto/create-brand-price-rule.dto';
import { UpdateBrandPriceRuleDto } from './dto/update-brand-price-rule.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

// PR-185: 브랜드 전용가(예: 뮤트 겉감 $1.00/YD) — 조회는 로그인한 모든 사용자, 쓰기는 MANAGER/ADMIN.
@ApiTags('브랜드 전용가 (마스터·설정)')
@ApiBearerAuth()
@Controller('brand-price-rules')
export class BrandPriceRulesController {
  constructor(private readonly service: BrandPriceRulesService) {}

  @Get()
  @ApiOperation({ summary: '브랜드 전용가 목록' })
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: '브랜드 전용가 등록' })
  create(@Body() dto: CreateBrandPriceRuleDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: '브랜드 전용가 수정' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBrandPriceRuleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: '브랜드 전용가 삭제' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
