import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional } from 'class-validator';
import { CashVoucherType } from '../entities/cash-voucher.entity';

export class FindCashVouchersDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: CashVoucherType })
  @IsOptional()
  @IsEnum(CashVoucherType)
  voucherType?: CashVoucherType;

  // PR-108: 거래내역서(특정 거래처의 입출금 내역만 발급)를 위한 필터 — 회사 전체
  // 합계만 가능했던 기존 조회/요약에 거래처 단위 필터를 추가한다.
  @ApiPropertyOptional({ description: '고객사(Buyer) ID로 필터', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  buyerId?: number;

  @ApiPropertyOptional({ description: '공급업체(Supplier) ID로 필터', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number;
}
