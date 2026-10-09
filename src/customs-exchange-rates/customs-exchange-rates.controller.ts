import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomsExchangeRatesService } from './customs-exchange-rates.service';
import { CreateCustomsExchangeRateDto } from './dto/create-customs-exchange-rate.dto';
import { UpdateCustomsExchangeRateDto } from './dto/update-customs-exchange-rate.dto';
import { GetCustomsExchangeRatesFilterDto } from './dto/get-customs-exchange-rates-filter.dto';
import { LookupCustomsExchangeRateDto, GetCustomsExchangeRateStatusDto } from './dto/lookup-customs-exchange-rate.dto';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

// PR-184: 관세청 주간환율(수출/수입) — 조회는 로그인한 모든 사용자, 쓰기는 MANAGER/ADMIN.
@ApiTags('관세청 주간환율 (마스터·설정)')
@ApiBearerAuth()
@Controller('customs-exchange-rates')
export class CustomsExchangeRatesController {
  constructor(private readonly service: CustomsExchangeRatesService) {}

  @Get()
  @ApiOperation({ summary: '주간 환율 목록(최신 적용 시작일 순)' })
  findAll(@Query() filter: GetCustomsExchangeRatesFilterDto) {
    return this.service.findAll(filter);
  }

  @Get('lookup')
  @ApiOperation({ summary: '날짜에 적용되는 환율 조회(없으면 직전 등록 주를 참고로만 제공, 자동 적용 안 함)' })
  lookup(@Query() query: LookupCustomsExchangeRateDto) {
    return this.service.lookup(query.rateType, query.currency ?? 'USD', query.date);
  }

  @Get('status')
  @ApiOperation({ summary: '수출/수입 환율이 오늘(한국시간) 등록돼 있는지 한 번에 조회 — 로그인 직후 팝업용' })
  status(@Query() query: GetCustomsExchangeRateStatusDto) {
    return this.service.status(query.currency ?? 'USD', query.date);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: '주간 환율 등록' })
  create(@Body() dto: CreateCustomsExchangeRateDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: '주간 환율 수정' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomsExchangeRateDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: '주간 환율 삭제' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
