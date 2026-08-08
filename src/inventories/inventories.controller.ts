import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InventoriesService } from './inventories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('inventories')
@UseGuards(JwtAuthGuard)
export class InventoriesController {
  constructor(private readonly inventoriesService: InventoriesService) {}

  @Get()
  findAll() {
    return this.inventoriesService.findAll();
  }

  @Get('item/:itemId')
  getByItemId(@Param('itemId') itemId: string) {
    return this.inventoriesService.getByItemId(itemId);
  }
}