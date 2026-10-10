import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

// PR-186-FIX: itemId/materialSubType 형식이 틀리면(문자열 id 등) 400으로 거절한다 —
// 인라인 타입이던 기존 바디는 class-validator가 전혀 작동하지 않아 500이 날 수 있었다.
export class ThreadTapeClassificationAssignmentDto {
  @ApiProperty({ description: '품목 ID' })
  @IsInt()
  itemId: number;

  // null이면 "실/테이프 아님"으로 확정(검토완료, 종류는 비움).
  @ApiProperty({ description: '실/테이프 종류(material_packaging_unit_rules.materialSubType). null이면 실/테이프 아님으로 확정', nullable: true })
  @IsOptional()
  @IsString()
  materialSubType: string | null;
}
