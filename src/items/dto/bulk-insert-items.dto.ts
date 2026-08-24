import { IsEnum, IsNotEmpty, IsOptional, IsString, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ItemType } from '../entities/item-type.enum';

export class BulkInsertItemDto {
  @ApiProperty({ description: '품목 코드' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: '품목 명' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: '품목 유형', enum: ItemType })
  @IsEnum(ItemType)
  type: ItemType;

  @ApiProperty({ description: '단위', required: false })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiProperty({ description: '규격', required: false })
  @IsString()
  @IsOptional()
  spec?: string;

  @ApiProperty({ description: '설명', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}

export class BulkInsertDto {
  @ApiProperty({ description: '등록할 품목 목록', type: [BulkInsertItemDto] })
  @IsArray()
  items: BulkInsertItemDto[];

  @ApiProperty({ description: '중복 코드 처리 정책', enum: ['OVERWRITE', 'SKIP'] })
  @IsString()
  policy: 'OVERWRITE' | 'SKIP';
}
