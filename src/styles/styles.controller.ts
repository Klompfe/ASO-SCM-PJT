import { Controller, Get, Post, Body, Query, Param, Delete, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StylesService } from './styles.service';
import { CreateMasterStyleDto } from './dto/create-master-style.dto';
import { FindMasterStylesDto } from './dto/find-master-styles.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

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

  // [정리] 스타일 삭제는 Bom/BomItem/Contract/OrderProcessStage/OrderShipment까지
  // 함께 지워지는 파괴적인 작업이라 MANAGER/ADMIN으로 제한한다(RBAC 관례는
  // contracts.controller.ts의 승인/거절/삭제와 동일).
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Delete(':styleNo')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('styleNo') styleNo: string) {
    await this.stylesService.remove(styleNo);
    return { message: `스타일 ${styleNo}이(가) 삭제되었습니다.` };
  }
}
