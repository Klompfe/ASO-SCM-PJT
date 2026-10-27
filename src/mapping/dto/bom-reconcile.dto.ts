import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { CommitBomItemDto } from './commit-mapping.dto';

export type BomReconcileActionType = 'OVERWRITE' | 'ADD' | 'REMOVE' | 'REPLACE';

// PR-198: bom-diff 비교 화면에서 사람이 행별로 고른 동작 — bomItemId는 OVERWRITE/REMOVE/REPLACE에서
// 필수(서비스에서 검증), newItem은 OVERWRITE/ADD/REPLACE에서 필수. REMOVE는 bomItemId만 있으면 된다.
export class BomReconcileActionDto {
  @ApiProperty({ enum: ['OVERWRITE', 'ADD', 'REMOVE', 'REPLACE'] })
  @IsIn(['OVERWRITE', 'ADD', 'REMOVE', 'REPLACE'])
  type: BomReconcileActionType;

  @ApiPropertyOptional({ description: '기존 BOM 행 id (OVERWRITE/REMOVE/REPLACE)' })
  @IsOptional()
  bomItemId?: number;

  @ApiPropertyOptional({ type: CommitBomItemDto, description: '엑셀에서 온 값 (OVERWRITE/ADD/REPLACE)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CommitBomItemDto)
  newItem?: CommitBomItemDto;
}

export class BomReconcileRequestDto {
  @ApiProperty({ example: 'MB73SKM109Z' })
  @IsNotEmpty()
  @IsString()
  styleNo: string;

  @ApiProperty({ type: [BomReconcileActionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BomReconcileActionDto)
  actions: BomReconcileActionDto[];
}
