import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BrandPrefixRulesService } from './brand-prefix-rules.service';
import { CreateBrandPrefixRuleDto } from './dto/create-brand-prefix-rule.dto';
import { UpdateBrandPrefixRuleDto } from './dto/update-brand-prefix-rule.dto';

@ApiTags('브랜드 접두사 규칙 (마스터·설정)')
@ApiBearerAuth()
@Controller('brand-prefix-rules')
export class BrandPrefixRulesController {
  constructor(private readonly service: BrandPrefixRulesService) {}

  @Get()
  @ApiOperation({ summary: '브랜드 접두사 규칙 목록 조회' })
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @ApiOperation({ summary: '브랜드 접두사 규칙 등록' })
  create(@Body() dto: CreateBrandPrefixRuleDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '브랜드 접두사 규칙 수정' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBrandPrefixRuleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '브랜드 접두사 규칙 삭제' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
