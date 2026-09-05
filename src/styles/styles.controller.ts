import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StylesService } from './styles.service';
import { CreateMasterStyleDto } from './dto/create-master-style.dto';
import { FindMasterStylesDto } from './dto/find-master-styles.dto';

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
  findAll(@Query() query: FindMasterStylesDto) {
    return this.stylesService.findAll(query);
  }
}
