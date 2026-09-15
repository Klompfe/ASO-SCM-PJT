import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { CashVoucherType } from '../entities/cash-voucher.entity';

export class CreateCashVoucherDto {
  @ApiProperty({ enum: CashVoucherType, example: CashVoucherType.DEPOSIT })
  @IsEnum(CashVoucherType)
  voucherType: CashVoucherType;

  @ApiProperty({ example: '2026-09-15' })
  @IsDateString()
  voucherDate: string;

  @ApiProperty({ example: 5000000 })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ description: '거래처명(자유입력)', example: '태일비나' })
  @IsNotEmpty()
  @IsString()
  counterpartyName: string;

  @ApiPropertyOptional({ description: '거래처가 Buyer 마스터에 있으면 선택적으로 연결', example: 1 })
  @IsOptional()
  @IsInt()
  counterpartyBuyerId?: number;

  @ApiPropertyOptional({ description: '거래처가 Supplier 마스터에 있으면 선택적으로 연결', example: 1 })
  @IsOptional()
  @IsInt()
  counterpartySupplierId?: number;

  @ApiProperty({ description: '입출금 계좌/현금 구분(자유입력)', example: '국민은행 태일무역' })
  @IsNotEmpty()
  @IsString()
  account: string;

  @ApiProperty({ description: '분류(자유입력)', example: '원자재대금' })
  @IsNotEmpty()
  @IsString()
  category: string;

  @ApiPropertyOptional({ description: '관련 발주 id', example: 1 })
  @IsOptional()
  @IsInt()
  relatedPurchaseOrderId?: number;

  @ApiPropertyOptional({ description: '관련 생산계약(PR-093) id', example: 1 })
  @IsOptional()
  @IsInt()
  relatedProductionContractId?: number;

  @ApiPropertyOptional({ example: '9월분 원자재대금 송금' })
  @IsOptional()
  @IsString()
  note?: string;
}
