import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CashVouchersService } from './cash-vouchers.service';
import { CreateCashVoucherDto } from './dto/create-cash-voucher.dto';
import { UpdateCashVoucherDto } from './dto/update-cash-voucher.dto';
import { FindCashVouchersDto } from './dto/find-cash-vouchers.dto';
import { CashVoucher } from './entities/cash-voucher.entity';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

// PR-153: 생성/수정/삭제(입출금전표 CUD)는 회계관리자(ACCOUNTING)/MASTER만 가능하도록
// 제한한다 — 기존엔 권한 가드가 전혀 없어 로그인만 되면 누구나 CUD가 가능했다(확인 완료).
// 조회(GET/summary)는 다른 부서도 참고할 수 있어야 해 제한하지 않는다(제시님 확인 완료).
@ApiTags('입출금전표관리 (회계관리)')
@ApiBearerAuth()
@Controller('cash-vouchers')
export class CashVouchersController {
  constructor(private readonly cashVouchersService: CashVouchersService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ACCOUNTING, UserRole.MASTER)
  @ApiOperation({ summary: '입출금전표 등록' })
  @ApiResponse({ status: 201, description: '성공적으로 등록됨', type: CashVoucher })
  create(@Body() dto: CreateCashVoucherDto, @GetUser() user: any): Promise<CashVoucher> {
    return this.cashVouchersService.create(dto, user.userId);
  }

  // 'summary'가 ':id'(숫자) 세그먼트와 겹치지 않도록 ':id' 라우트보다 먼저 선언한다.
  @Get('summary')
  @ApiOperation({ summary: '기간 입금합계/출금합계/잔액 요약 (거래처 필터 시 거래내역서용 요약, PR-108)' })
  @ApiQuery({ name: 'from', required: false, example: '2026-09-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-09-30' })
  @ApiQuery({ name: 'buyerId', required: false, example: 1 })
  @ApiQuery({ name: 'supplierId', required: false, example: 1 })
  getSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('buyerId') buyerId?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.cashVouchersService.getSummary(
      from,
      to,
      buyerId ? Number(buyerId) : undefined,
      supplierId ? Number(supplierId) : undefined,
    );
  }

  @Get()
  @ApiOperation({ summary: '입출금전표 목록 조회 (기간/구분 필터)' })
  @ApiResponse({ status: 200, description: '조회 성공', type: [CashVoucher] })
  findAll(@Query() filter: FindCashVouchersDto): Promise<CashVoucher[]> {
    return this.cashVouchersService.findAll(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: '입출금전표 상세 조회' })
  @ApiResponse({ status: 200, description: '조회 성공', type: CashVoucher })
  @ApiResponse({ status: 404, description: '전표를 찾을 수 없음' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<CashVoucher> {
    return this.cashVouchersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ACCOUNTING, UserRole.MASTER)
  @ApiOperation({ summary: '입출금전표 수정' })
  @ApiResponse({ status: 200, description: '수정 완료', type: CashVoucher })
  @ApiResponse({ status: 404, description: '전표를 찾을 수 없음' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCashVoucherDto,
  ): Promise<CashVoucher> {
    return this.cashVouchersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ACCOUNTING, UserRole.MASTER)
  @ApiOperation({ summary: '입출금전표 삭제' })
  @ApiResponse({ status: 200, description: '삭제 완료' })
  @ApiResponse({ status: 404, description: '전표를 찾을 수 없음' })
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.cashVouchersService.remove(id);
  }
}
