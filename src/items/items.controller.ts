import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateBomDto } from './dto/create-bom.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.enum';

@Controller('items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  // 품목 등록 (ADMIN, MANAGER 가능)
  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  createItem(@Body() createItemDto: CreateItemDto) {
    return this.itemsService.createItem(createItemDto);
  }

  // 전체 품목 목록 조회
  @Get()
  findAllItems() {
    return this.itemsService.findAllItems();
  }

  // 단일 품목 상세 조회
  @Get(':id')
  findItemById(@Param('id') id: string) {
    return this.itemsService.findItemById(id);
  }

  // BOM 자재명세서 등록 (ADMIN, MANAGER 가능)
  @Post('bom')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  createBom(@Body() createBomDto: CreateBomDto) {
    return this.itemsService.createBom(createBomDto);
  }

  // 특정 품목의 BOM 조회
  @Get(':id/bom')
  getBomByParentId(@Param('id') id: string) {
    return this.itemsService.getBomByParentId(id);
  }
}