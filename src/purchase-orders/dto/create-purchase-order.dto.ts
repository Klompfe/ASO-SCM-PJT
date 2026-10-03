import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePurchaseOrderDto {
  @ApiProperty({ description: '공급업체 ID', example: 1 })
  @IsInt()
  supplierId: number;

  @ApiProperty({ description: '품목 ID', example: 1 })
  @IsInt()
  itemId: number;

  @ApiProperty({ description: '주문 수량', example: 100 })
  @IsInt()
  @Min(1)
  quantity: number;

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

  @ApiProperty({ description: '비고/설명', example: '1분기 원자재 발주', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}