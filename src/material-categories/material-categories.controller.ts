import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MaterialCategoriesService } from './material-categories.service';
import { CreateMaterialCategoryDto } from './dto/create-material-category.dto';
import { UpdateMaterialCategoryDto } from './dto/update-material-category.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('품목군 (마스터·설정)')
@ApiBearerAuth()
@Controller('material-categories')
export class MaterialCategoriesController {
  constructor(private readonly service: MaterialCategoriesService) {}

  @Get()
  @ApiOperation({ summary: '품목군 목록(활성 우선, 정렬순)' })
  findAll() {
    return this.service.findAll();
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Post()
  @ApiOperation({ summary: '품목군 추가' })
  create(@Body() dto: CreateMaterialCategoryDto) {
    return this.service.create(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Patch(':id')
  @ApiOperation({ summary: '품목군 이름/순서/활성 수정' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMaterialCategoryDto) {
    return this.service.update(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Delete(':id')
  @ApiOperation({ summary: '품목군 삭제(사용 중이면 400 — 비활성으로 바꿀 것)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
