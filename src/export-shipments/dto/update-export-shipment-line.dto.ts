import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

// 5절: 단가는 사람이 화면에서 직접 입력하는 유일한 편집 가능 필드다 — amount는
// 서버에서 unitPrice*qty로 재계산하므로 요청에 포함시키지 않는다.
export class UpdateExportShipmentLineDto {
  // PR-173: 미도 단가표 실측 최대 소수 5자리(0.00012) 기준 6자리로 여유있게 허용.
  @ApiPropertyOptional({ example: 1.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  unitPrice?: number;
}
