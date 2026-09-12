import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

// 5절: 단가는 사람이 화면에서 직접 입력하는 유일한 편집 가능 필드다 — amount는
// 서버에서 unitPrice*qty로 재계산하므로 요청에 포함시키지 않는다.
export class UpdateExportShipmentLineDto {
  @ApiPropertyOptional({ example: 1.5 })
  @IsOptional()
  @IsNumber()
  unitPrice?: number;
}
