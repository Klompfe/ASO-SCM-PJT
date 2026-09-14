import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// 관리자가 화면에서 1건을 직접 등록/수정할 때 쓴다. (itemType, fabricType,
// composition) 조합이 이미 있으면 hsCode/note를 갱신하고, 없으면 새로 만든다
// (import와 동일한 upsert 규칙 — HsCodeClassificationsService.upsertOne 재사용).
export class CreateHsCodeClassificationDto {
  @ApiProperty({ example: "WOMEN'S JACKET" })
  @IsNotEmpty()
  @IsString()
  itemType: string;

  @ApiProperty({ example: '직물' })
  @IsNotEmpty()
  @IsString()
  fabricType: string;

  @ApiProperty({ example: 'WOOL 98%, POLYURETHANE 2%' })
  @IsNotEmpty()
  @IsString()
  composition: string;

  @ApiProperty({ example: '6202.20.1000' })
  @IsNotEmpty()
  @IsString()
  hsCode: string;

  @ApiPropertyOptional({ description: '관,부가세 유무 등 참고 메모(자유 텍스트)' })
  @IsOptional()
  @IsString()
  note?: string;

  // PR-084: 등록/수정과 동시에 이 스타일번호를 이 조합에 연결(upsertStyleMapping)한다
  // — 관세사 확인 후 화면에서 바로 스타일↔분류를 고칠 수 있게 하는 목적.
  @ApiPropertyOptional({ example: 'BF6X21C52' })
  @IsOptional()
  @IsString()
  styleNo?: string;
}
