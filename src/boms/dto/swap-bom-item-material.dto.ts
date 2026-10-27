import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

// PR-197: 이미 저장된 BOM 행이 가리키는 자재를 "이미 있는 다른 자재"로 바꾼다(이름
// 오인식을 올바른 자재로 교체하는 용도). 없는 이름/id는 새로 만들지 않고 400 —
// 새 자재는 기존 자재 등록 화면에서만 만든다. materialId 또는 materialName 중
// 하나만 있으면 되고(둘 다 없으면 서비스에서 400), materialId가 있으면 그것을 우선한다.
export class SwapBomItemMaterialDto {
  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @IsInt()
  materialId?: number;

  @ApiPropertyOptional({ example: '스쿠이사' })
  @IsOptional()
  @IsString()
  materialName?: string;
}
