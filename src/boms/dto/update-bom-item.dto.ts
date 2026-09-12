import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// PR-073: 수출 선적서류(INVOICE/Packing List) 자동생성을 위해 BomItem에 혼용율/HS코드를
// 스타일별로 입력·수정할 수 있어야 한다. 지금은 이 두 필드만 인라인 수정 대상이라
// 최소 범위로 둔다.
export class UpdateBomItemDto {
  @ApiPropertyOptional({ example: 'WOOL 98%, POLYURETHANE 2%' })
  @IsOptional()
  @IsString()
  composition?: string;

  @ApiPropertyOptional({ example: '6110.30' })
  @IsOptional()
  @IsString()
  hsCode?: string;
}
