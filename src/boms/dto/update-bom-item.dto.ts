import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ThreadType } from '../entities/bom-item.entity';

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

  // PR-157: 실(THREAD) 자재의 콘가격 환산용 — 자재명 텍스트만으로는 신뢰성 있게
  // 자동 분류할 수 없어(실 데이터 조사 결과) 사람이 직접 고른다. 실이 아닌 자재는
  // 건드리지 않는다(보내지 않으면 기존 값 유지).
  @ApiPropertyOptional({ enum: ThreadType })
  @IsOptional()
  @IsEnum(ThreadType)
  threadType?: ThreadType;
}
