import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MaterialPackagingUnitRulesService } from './material-packaging-unit-rules.service';
import { CreateMaterialPackagingUnitRuleDto } from './dto/create-material-packaging-unit-rule.dto';
import { UpdateMaterialPackagingUnitRuleDto } from './dto/update-material-packaging-unit-rule.dto';

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

  @Post()
  @ApiOperation({ summary: '자재 포장단위 규칙 등록' })
  create(@Body() dto: CreateMaterialPackagingUnitRuleDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '자재 포장단위 규칙 수정' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMaterialPackagingUnitRuleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '자재 포장단위 규칙 삭제' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
