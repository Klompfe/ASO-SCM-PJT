import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { CommitBomItemDto } from '../../mapping/dto/commit-mapping.dto';

// PR-235(PILOT-23 후속): 작지 저장 전 "기존 BOM과 비교"용 읽기 전용 요청 — PR-198의
// BomDiffRequestDto와 같은 원칙(commit이 받는 바디에서 overviewData를 뺀 형태)이지만
// AI 인식 경로(수주 등록) 전용으로 별도 DTO를 둔다 — bomItems 자체는 CommitBomItemDto를
// 그대로 재사용(englishName 포함).
export class SalesOrderBomCompareRequestDto {
  @ApiProperty({ example: 'MB62SLM103Z' })
  @IsNotEmpty()
  @IsString()
  styleNo: string;

  @ApiProperty({ type: [CommitBomItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommitBomItemDto)
  bomItems: CommitBomItemDto[];
}
