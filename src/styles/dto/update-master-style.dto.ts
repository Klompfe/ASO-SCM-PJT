import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ProductionType } from '../entities/style-overview.entity';

// PR-141: 등록 시 받는 필드(create-master-style.dto.ts) 중 styleNo만 뺐다 — 다른
// 테이블(Bom/Contract/OrderProcessStage/OrderShipment 등)이 이 값을 문자열로 그대로
// 참조하는 키라서, 여기서 바꾸면 그 테이블들의 참조가 조용히 끊긴다. 스타일번호 자체를
// 바꾸는 기능은 이번 범위가 아니다(styles.controller.ts UpdateMasterStyleDto에 styleNo가
// 없으므로 ValidationPipe의 forbidNonWhitelisted가 자동으로 그 시도를 400으로 막는다).
export class UpdateMasterStyleDto {
  @ApiPropertyOptional({ example: '베트남' })
  @IsOptional()
  @IsString()
  factory?: string;

  @ApiPropertyOptional({ example: '미도컴퍼니' })
  @IsOptional()
  @IsString()
  buyer?: string;

  @ApiPropertyOptional({ example: 700 })
  @IsOptional()
  @IsNumber()
  totalQty?: number;

  @ApiPropertyOptional({ example: 'ASO' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: 'TOP' })
  @IsOptional()
  @IsString()
  itemType?: string;

  @ApiPropertyOptional({ enum: ProductionType, example: ProductionType.FOB })
  @IsOptional()
  @IsEnum(ProductionType)
  productionType?: ProductionType;

  @ApiPropertyOptional({ example: '2026-12-01' })
  @IsOptional()
  @IsDateString()
  targetRdd?: string;

  @ApiPropertyOptional({ example: 5.5 })
  @IsOptional()
  @IsNumber()
  cmtPrice?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  fobPrice?: number;
}
