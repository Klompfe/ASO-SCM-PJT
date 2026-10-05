import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMaterialPackagingUnitRuleDto {
  @ApiProperty({ description: 'BomItem.threadType/tapeType enum 값과 동일한 문자열 키', example: 'COA_SA' })
  @IsNotEmpty()
  @IsString()
  materialSubType: string;

  @ApiProperty({ description: '화면 표시용 한글명', example: '코아사' })
  @IsNotEmpty()
  @IsString()
  displayName: string;

  @ApiProperty({ description: '포장단위 명칭', example: '콘' })
  @IsNotEmpty()
  @IsString()
  packagingUnitLabel: string;

  @ApiProperty({ description: '포장단위 하나당 길이(미터)', example: 2500 })
  @IsNumber()
  @Min(0)
  unitLengthM: number;

  @ApiPropertyOptional({ description: '비고' })
  @IsOptional()
  @IsString()
  note?: string;
}
