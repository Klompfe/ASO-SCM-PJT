import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
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
}
