import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ItemType } from '../entities/item-type.enum';

export class CreateItemDto {
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

  @ApiProperty({ description: 'FINISHED_GOOD Item이 속한 MasterStyle의 styleNo', required: false })
  @IsString()
  @IsOptional()
  styleNo?: string;
}