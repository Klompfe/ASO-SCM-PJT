import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StylesService } from './styles.service';
import { CreateMasterStyleDto } from './dto/create-master-style.dto';

@ApiTags('마스터 스타일')
@ApiBearerAuth()
@Controller('master-styles')
export class StylesController {
  constructor(private readonly stylesService: StylesService) {}

  @Post()
  create(@Body() dto: CreateMasterStyleDto) {
    return this.stylesService.create(dto);
  }

  @Get()
  findAll() {
    return this.stylesService.findAll();
  }
}
