import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { ItemsService } from './items.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateBomDto } from './dto/create-bom.dto';

@ApiTags('items')
@ApiBearerAuth()
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: '전체 품목 목록 조회' })
  findAll() {
    return this.itemsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({ summary: '품목 생성' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        code: { type: 'string', example: 'ITEM-001' },
        name: { type: 'string', example: '완제품 A' },
        type: { type: 'string', example: 'PRODUCT' },
      },
    },
  })
  create(@Body() createItemDto: any) {
    return this.itemsService.create(createItemDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bom')
  @ApiOperation({ summary: 'BOM 소요량 관계 등록' })
  createBom(@Body() createBomDto: CreateBomDto) {
    return this.itemsService.createBom(createBomDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/bom')
  @ApiOperation({ summary: '하위 자재 BOM 목록 역추적 조회' })
  getBom(@Param('id') id: string) {
    return this.itemsService.getBom(id);
  }
}