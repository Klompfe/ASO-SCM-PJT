import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator';
import { PurchaseOrderType } from '../entities/purchase-order.entity';

// PR-176: 색상/사이즈별 상세 한 줄(자유 텍스트 색상/사이즈 + 수량).
export class PurchaseOrderLineDto {
  @ApiPropertyOptional({ example: 'BLACK' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: 'M' })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(1)
  qty: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ description: '공급업체 ID', example: 1 })
  @IsInt()
  supplierId: number;

  @ApiProperty({ description: '품목 ID', example: 1 })
  @IsInt()
  itemId: number;

  // PR-176: lines를 보내면 총수량은 라인 합계로 계산된다(이때 quantity를 같이 보내 다르면 경고).
  // lines가 없으면 기존처럼 quantity를 필수로 쓴다 — 서비스에서 검사한다.
  @ApiPropertyOptional({ description: '주문 수량(라인이 없으면 필수, 라인이 있으면 라인 합계가 우선)', example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  // PR-173: CMT 계약 건의 원부자재 발주는 단가가 당장 필요 없다(수출선적서류 작성
  // 시점에만 필요) — 프론트(PurchaseOrdersManager.tsx)가 선택된 품목의 스타일
  // productionType을 조회해 CMT면 비워서 보낼 수 있게 했다. FOB는 프론트에서 여전히
  // 필수로 막는다(서버는 두 경우 모두 null을 허용 — 필수 여부 판단은 프론트 책임).
  // 소수점 정밀도: 실제 미도 단가표 확인 결과 최대 5자리(0.00012)까지 쓰여 6자리로
  // 여유있게 허용한다(PR-173 조사 결과).
  @ApiPropertyOptional({ description: '품목 단가(CMT는 선택 — 선적서류 작성 시점에 입력 가능)', example: 12.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  unitPrice?: number;

  // PR-180: 실발주(FIRM)/가발주(PROVISIONAL). 화면이 제안값을 보여주고 사람이 확정해 보낸다 — 서버는 추측해서 채우지 않는다.
  @ApiProperty({ enum: PurchaseOrderType, required: false, description: '발주 구분(실발주/가발주)' })
  @IsEnum(PurchaseOrderType)
  @IsOptional()
  orderType?: PurchaseOrderType;

  @ApiProperty({ description: '비고/설명', example: '1분기 원자재 발주', required: false })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ type: [PurchaseOrderLineDto], description: '색상/사이즈별 상세(선택)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines?: PurchaseOrderLineDto[];

  // PR-185: 스타일 연결(선택). 있으면 그 스타일이 존재해야 하고(없으면 400) 최신 BOM에
  // itemId 자재가 있어야 한다(없으면 400 — 두 트랙을 섞지 않기 위함). 없으면(미전송)
  // 기존처럼 "스타일 미연결" 발주로 등록된다.
  @ApiPropertyOptional({ description: '연결할 스타일번호(선택) — MasterStyle.styleNo', example: 'MB62SLM103Z' })
  @IsOptional()
  @IsString()
  styleNo?: string;

  // PR-185: 단가표(USD) 참고단가 — 선택 입력, KRW unitPrice와 별개. 서버는 값이 오면
  // 양수인지만 검증하고 출처·값을 자동으로 채우지 않는다.
  @ApiPropertyOptional({ description: '단가표 참고단가(USD, 선택)', example: 1.0 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  referenceUnitPriceUsd?: number;

  @ApiPropertyOptional({ enum: ['BRAND_RULE', 'MIDO_TABLE', 'MANUAL'], description: '참고단가 출처(선택)' })
  @IsOptional()
  @IsEnum(['BRAND_RULE', 'MIDO_TABLE', 'MANUAL'])
  referencePriceSource?: 'BRAND_RULE' | 'MIDO_TABLE' | 'MANUAL';

  @ApiPropertyOptional({ description: '참고단가 선택 근거/환산식(선택)' })
  @IsOptional()
  @IsString()
  referencePriceNote?: string;
}
