import { Controller, Get, Post, Body, Patch } from '@nestjs/common';
import { StylesService } from './styles.service';

@Controller('styles')
export class StylesController {
  constructor(private readonly stylesService: StylesService) {}

  @Post()
  create(@Body() dto: any) {
    return this.stylesService.create(dto);
  }

  @Get()
  findAll() {
    return this.stylesService.findAll();
  }
}
