import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { CommitBomItemDto } from './commit-mapping.dto';

// PR-198: 엑셀 업로드 저장 전 "기존 BOM과 비교"용 읽기 전용 요청 — commit()이 받는
// 바디에서 overviewData를 뺀 형태(저장에 필요 없음).
export class BomDiffRequestDto {
  @ApiProperty({ example: 'MB73SKM109Z' })
  @IsNotEmpty()
  @IsString()
  styleNo: string;

  @ApiProperty({ type: [CommitBomItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommitBomItemDto)
  bomItems: CommitBomItemDto[];
}
